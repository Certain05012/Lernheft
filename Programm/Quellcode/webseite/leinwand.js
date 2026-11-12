'use strict';
// Die Schreibfläche für Skripte, Notizbücher und das Whiteboard.
// Seiten liegen untereinander, mittig um x = 0. Rundherum ist Rasterfläche, auf der man auch schreiben kann,
// nach links und rechts ohne Ende. Striche und Haftnotizen gehören jeweils zu einer Seite und
// werden in deren Koordinaten gespeichert (Einheit: CSS-Pixel bei 100 %, A4 = 794 breit).
(function () {
  const TINTE = {
    hell: { tinte: '#000000', blau: '#1f4fd1', rot: '#d0342c', gruen: '#1c8a4a', gelb: '#e0a800', lila: '#7a45cf' },
    dunkel: { tinte: '#ffffff', blau: '#8aabff', rot: '#ff7a6e', gruen: '#6fd69b', gelb: '#ffd84a', lila: '#bb9cff' }
  };
  const FARBNAMEN = { tinte: 'Schwarz / Weiss', blau: 'Blau', rot: 'Rot', gruen: 'Grün', gelb: 'Gelb', lila: 'Lila' };
  // Textmarker leuchten in eigenen Farben, auf hellem und dunklem Papier gleich
  const MARKER = { gelb: '#ffe03a', rot: '#ff4d4d', gruen: '#3ddc6e', lila: '#a66bff' };
  const MARKERNAMEN = { gelb: 'Gelb', rot: 'Rot', gruen: 'Grün', lila: 'Violett' };
  const NOTIZFARBEN = { gelb: '#ffe98a', rosa: '#ffc6d9', blau: '#c4e2ff', gruen: '#cdf0c4', orange: '#ffd6ad' };
  const NOTIZNAMEN = { gelb: 'Gelb', rosa: 'Rosa', blau: 'Blau', gruen: 'Grün', orange: 'Orange' };
  const PAPIER = { hell: '#ffffff', dunkel: '#172139' };
  const LINIEN = { hell: 'rgba(60, 95, 150, .20)', dunkel: 'rgba(255, 255, 255, .30)' };
  const FORMATE = { A4: { b: 794, h: 1123, mm: 210 }, A3: { b: 1123, h: 1587, mm: 297 } };
  // Seiten drehen und Querformat. Gedreht wird je Seite in 90°-Schritten, gespeichert im Dokument:
  // it.drehung = { <Seiten-Id>: 90 | 180 | 270 } (Notizbuch: sid, Skript: 'p' + Seitennummer). it.quer = ganzes
  // Notizbuch im Querformat. Alles, was Seiten misst oder PDF-Seiten rendert, nimmt diese Helfer (Bildschirm,
  // Seitenleiste, Vorschaubilder, Export, Umwandeln).
  const DREHUNGEN = [0, 90, 180, 270];
  function drehungVon(it, sid) { const d = it && it.drehung ? Number(it.drehung[sid]) : 0; return DREHUNGEN.includes(d) ? d : 0; }
  function seitenFormat(it, sid) {
    const F = FORMATE[it && it.format] || FORMATE.A4;
    const quer = !!(it && it.quer) !== (drehungVon(it, sid) % 180 !== 0);
    return quer ? { b: F.h, h: F.b, mm: F.mm * F.h / F.b, quer: true } : { b: F.b, h: F.h, mm: F.mm, quer: false };
  }
  // Ansicht einer PDF-Seite: eigene Drehung der Datei (/Rotate, z. B. Querformat) plus die im Lernheft gewählte
  function pdfAnsicht(seite, scale, it, nr) {
    return seite.getViewport({ scale, rotation: ((seite.rotate || 0) + drehungVon(it, 'p' + nr)) % 360 });
  }
  const RADIER_BEREICH = { klein: 6, mittel: 14, gross: 28 };
  const RADIERER = 10;
  const ZOOM_MIN = 0.12, ZOOM_MAX = 8;
  const LUECKE = 28;          // Abstand zwischen den Seiten
  const RAND = 16;            // Abstand zum Fensterrand beim Einpassen
  const KARO = 20;            // Raster der Fläche um die Seiten
  const GRIFF = 11;           // Grösse der Skalier-Griffe in Bildschirm-px
  const NEUE_SEITE_H = 110;
  const NOTIZ_KOPF = 26;      // Kopfleiste einer Haftnotiz mit Zuklappen und ⋯
  const NOTIZ_ZU = 36;        // zugeklappt: kleines Quadrat
  const NOTIZ_MIN = { b: 90, h: 70 };
  const NOTIZ_ECKE = 18;      // Ecke unten rechts zum Grösserziehen

  // Stiftgrössen gelten in Millimetern. Eine Einheit der Schreibfläche ist ein CSS-Pixel (1/96 Zoll), A4 = 794 x 1123
  // Einheiten = 210 x 297 mm, also 1 mm = 96 / 25,4 Einheiten, auf jedem Bildschirm und bei jedem Zoom gleich gross
  // im Verhältnis zum Blatt. Gespeichert wird weiter in Einheiten (Format 2), umgerechnet wird nur an der Oberfläche.
  const MM = 96 / 25.4;
  // Millimeter -> Einheiten der Schreibfläche. Der Radierer wird als Durchmesser angegeben, gerechnet wird mit dem Radius.
  // Text: Schriftgrösse in Punkt (1 pt = 1/72 Zoll = 96/72 Einheiten)
  const einheit = (art, mm) => (art === 'text' ? mm * 96 / 72 : mm * MM * (art === 'radierer' ? 0.5 : 1));

  // Glättung der Handschrift ohne Nachziehen: jeder Punkt wird erst festgelegt, wenn ein paar weitere da sind, und dann
  // aus seinen Nachbarn VOR und NACH ihm gemittelt (Gauss über die Weglänge, Breite in Bildschirm-px). So verschwindet das
  // Zittern des Stifts und der Bildschirm-Raster, ohne dass die Linie hinterherhinkt oder Ecken abschneidet wie ein
  // Filter, der nur die Vergangenheit kennt (früher One-Euro: Niedrig verschob Spitzen bis 7 px). Das Stück, das noch
  // nicht fest ist, zeigt die Spitze genau unter dem Stift. Standard: Niedrig (wirkt nur auf wenige px).
  const GLAETTUNG = { aus: 0, niedrig: 1.6, mittel: 2.8, hoch: 4.5 };
  const DRUCK_FENSTER = 3;
  let stiftZuletzt = 0;       // performance.now() des letzten Stiftereignisses auf irgendeiner Schreibfläche    // so viele Punkte vor und nach einem Punkt glätten den Druck (die Breite zittert sonst)
  const HALTE_MS = 700;       // Stift so lange ruhig halten: Linie oder Form wird sauber (einstellbar: einst.halteMs, 0,4 bis 1,5 s)
  const haltezeit = einst => { const v = Number(einst.halteMs); return v >= 300 && v <= 3000 ? v : HALTE_MS; };
  const HALTE_TOL = 4;        // so viel (Bildschirm-px) darf die Hand dabei zittern

  // Gesten (einstellbar im Stift-Panel, einst.gesten, nur auf diesem Gerät). Finger: tippen = alle Finger kurz auf und
  // wieder weg, ohne zu wischen; halten = zwei Finger ruhig liegen lassen. Pencil (nur in der iPad-App, Safari meldet sie
  // nicht): Doppeltippen am Stift, Zusammendrücken (Pencil Pro).
  const GESTEN_STANDARD = { zweiFinger: 'rueckgaengig', dreiFinger: 'wiederholen', zweiFingerLang: 'seite', pencilDoppel: 'radierer', pencilDruecken: 'palette' };
  const GESTEN_AKTIONEN = {
    aus: 'Nichts', rueckgaengig: 'Rückgängig', wiederholen: 'Wiederholen', radierer: 'Radierer an/aus', letztes: 'Letztes Werkzeug',
    stift: 'Stift', marker: 'Textmarker', lasso: 'Lasso', text: 'Text', hand: 'Hand', laser: 'Laserpointer',
    palette: 'Palette am Stift (Werkzeuge, Farben, Grössen)',
    seite: 'Seiten-Menü (drehen, Gesten)', eigenschaften: 'Farben und Grössen', leiste: 'Werkzeugleiste ein/aus', vollbild: 'Vollbild ein/aus'
  };
  // Stiftarten (einst.stiftArt). Gespeichert wird ein Strich immer gleich (Punkte mit Druck, Format 2): die Art formt
  // nur den Druck, der beim Schreiben in die Punkte kommt, so sieht der Strich auf jedem Gerät und in jeder Version
  // gleich aus.
  //   fueller  Druck gibt die Breite (wie bisher), schnelle Züge werden etwas feiner, wie Tinte, die nicht nachkommt;
  //            mit einem Stift, der seine Drehung meldet (Apple Pencil Pro), ist die Feder breit und dreht sich mit
  //   kugel    überall gleich breit, ohne Druck (eine Linie: am schnellsten zu zeichnen)
  //   pinsel   weiche Spitze: setzt fein an, wird mit Druck (ohne Druck: langsam) breit und läuft am Ende spitz aus;
  //            doppelte Strichbreite, damit die feinen Stellen wirklich fein sind
  const STIFTARTEN = { fueller: 'Füller', kugel: 'Kugelschreiber', pinsel: 'Pinselstift' };
  const PINSEL_FAKTOR = 2;
  const stiftArt = einst => (STIFTARTEN[einst.stiftArt] ? einst.stiftArt : 'fueller');
  const stiftDicke = einst => einst.dicke * (stiftArt(einst) === 'pinsel' ? PINSEL_FAKTOR : 1);
  const weich = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const TIPP_MS = 350, TIPP_TOL = 12, HALTEN_MS = 600, HALTEN_TOL = 32;
  const LASER_NACHLEUCHTEN = 1400;   // ms, bis die Spur des Laserpunkts ganz verblasst ist
  const LASER_STANDARD = '#ff2d2d';
  // Grösste Zeichenfläche in Pixeln: Safari (iPad, iPhone) malt ab 16 777 216 Pixeln nichts mehr
  const CANVAS_MAX = 16e6;

  const r1 = n => Math.round(n * 10) / 10;
  const kurzId = () => Math.random().toString(36).slice(2, 10);
  const klon = o => JSON.parse(JSON.stringify(o));
  const istNotiz = e => e && e.typ === 'notiz';
  // Bild: { typ: 'bild', id, x, y, b, h, src (data-URL), erstellt, m }, liegt unter der Schrift
  const istBild = e => e && e.typ === 'bild';
  // Text: { typ: 'text', id, x, y, b (so breit darf eine Zeile höchstens werden, danach wird umgebrochen), t, gr
  // (Schriftgrösse in Einheiten), f (Farbe wie bei Strichen: Name oder #rrggbb), erstellt, m }. Die Höhe ergibt sich aus
  // dem Umbruch (textLayout), x/y ist die linke obere Ecke der ersten Zeile.
  const istText = e => e && e.typ === 'text';
  // Elemente mit Lage (x, y) statt Punkten
  const istKasten = e => istNotiz(e) || istBild(e) || istText(e);
  const istHex = f => typeof f === 'string' && /^#[0-9a-f]{6}$/i.test(f);
  // Sichtbare Grösse einer Haftnotiz: zugeklappt nur ein kleines Quadrat
  const sicht = n => (n.zu ? { b: NOTIZ_ZU, h: NOTIZ_ZU } : { b: n.b, h: n.h });
  const notizTitel = n => {
    const z = String(n.t || '').split('\n').find(x => x.trim());
    return z ? z.trim() : n.e && n.e.length ? 'Zeichnung' : 'Haftnotiz';
  };

  /* ---------- Farben des Themas ---------- */

  const thema = {};
  function leseThema() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, s) => cs.getPropertyValue(n).trim() || s;
    thema.aussen = v('--papier', '#0f131b');
    thema.karo = v('--karo', '#192030');
    thema.linie = v('--linie', '#2a3344');
    thema.auswahl = v('--fueller', '#8aabff');
    thema.grau = v('--grau', '#9aa3b6');
    thema.hell = document.documentElement.dataset.theme === 'light';
  }
  leseThema();
  const alleLeinwaende = new Set();
  // Die Desktop-App fragt vor dem Schliessen eines Fensters: alles Wartende sichern (auch den Text einer offenen Haftnotiz)
  if (window.lernheftDesktop && lernheftDesktop.vorSchliessen) {
    lernheftDesktop.vorSchliessen(() => {
      const a = document.activeElement;
      if (a && a.classList && a.classList.contains('lw-notiz-editor')) a.blur();
      alleLeinwaende.forEach(l => { l.beendeText(); l.sichern(); });
      if (window.Daten && Daten.flush) Daten.flush();
    });
  }
  /* ---------- Bilder ---------- */

  // Ein Bild liegt als data-URL im Element (und damit in der Seitendatei, gleicht sich mit ihr ab). Gemalt wird es aus
  // diesem Zwischenspeicher; solange es noch dekodiert wird, steht ein grauer Platzhalter da, danach wird neu gemalt.
  const bildSpeicher = new Map();   // src -> { img, bereit, fehler, warten: [] }
  function bildVon(src) {
    let c = bildSpeicher.get(src);
    if (c) return c;
    const img = new Image();
    c = { img, bereit: false, fehler: false, warten: [] };
    bildSpeicher.set(src, c);
    const fertig = ok => {
      c.bereit = ok; c.fehler = !ok;
      const w = c.warten; c.warten = [];
      w.forEach(fn => fn());
      alleLeinwaende.forEach(l => l.plane());
    };
    img.onload = () => fertig(true);
    img.onerror = () => fertig(false);
    img.src = src;
    return c;
  }
  // Wartet, bis alle Bilder der Liste gemalt werden können (für Export und Vorschaubilder)
  function bilderBereit(liste) {
    const offen = (liste || []).filter(istBild).map(e => bildVon(e.src)).filter(c => !c.bereit && !c.fehler);
    return Promise.all(offen.map(c => new Promise(ok => c.warten.push(ok))));
  }
  function malBildElement(ctx, e) {
    const c = typeof e.src === 'string' ? bildVon(e.src) : null;
    if (c && c.bereit) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(c.img, e.x, e.y, e.b, e.h);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.fillStyle = 'rgba(128, 138, 160, .18)';
    ctx.fillRect(e.x, e.y, e.b, e.h);
    ctx.strokeStyle = 'rgba(128, 138, 160, .55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(e.x, e.y, e.b, e.h);
    ctx.restore();
  }

  // Datei oder Zwischenablage -> { src, w, h }: höchstens BILD_MAX Pixel an der längsten Seite, als JPEG (Fotos) oder PNG
  // (Bildschirmfotos, Grafiken, Durchsichtiges; Schrift bleibt dort scharf). Ist es danach noch sehr gross, wird es kleiner.
  const BILD_MAX = 2000, BILD_GROESSE_MAX = 3.5e6;
  function ladeBlob(blob) {
    return new Promise((ok, fehler) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(url); fehler(new Error('Das Bild konnte nicht gelesen werden.')); };
      img.src = url;
    });
  }
  function hatTransparenz(c, w, h) {
    const d = c.getImageData(0, 0, w, h).data;
    const schritt = Math.max(1, Math.floor(Math.sqrt((w * h) / 250000))) * 4;
    for (let i = 3; i < d.length; i += schritt) if (d[i] < 250) return true;
    return false;
  }
  async function bereiteBildVor(blob) {
    if (!blob || !/^image\//.test(blob.type || 'image/')) throw new Error('Das ist kein Bild.');
    const img = await ladeBlob(blob);
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error('Das Bild ist leer.');
    const cv = document.createElement('canvas');
    try {
      for (let max = BILD_MAX; ; max = Math.round(max * 0.75)) {
        const k = Math.min(1, max / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
        cv.width = w; cv.height = h;
        const c = cv.getContext('2d', { willReadFrequently: true });
        c.clearRect(0, 0, w, h);
        c.imageSmoothingQuality = 'high';
        c.drawImage(img, 0, 0, w, h);
        const durchsichtig = !/jpe?g/i.test(blob.type) && hatTransparenz(c, w, h);
        let src = cv.toDataURL('image/png');
        if (!durchsichtig) {
          // JPEG nur, wenn es deutlich kleiner ist (bei Bildschirmfotos ist PNG oft kleiner und schärfer)
          const jpg = cv.toDataURL('image/jpeg', 0.88);
          if (jpg.length * 1.4 < src.length) src = jpg;
        }
        if (src.length <= BILD_GROESSE_MAX || max < 500) return { src, w, h };
      }
    } catch (e) {
      throw e && e.name === 'SecurityError' ? new Error('Dieses Bild lässt sich nicht einfügen.') : e;
    } finally { cv.width = 0; }
  }
  // Bild eines Elements als PNG (für "Kopieren" in die Zwischenablage)
  async function bildAlsPng(e) {
    const c = bildVon(e.src);
    if (!c.bereit) await bilderBereit([e]);
    if (!c.bereit) throw new Error('Das Bild ist nicht lesbar.');
    if (/^data:image\/png/.test(e.src)) return (await fetch(e.src)).blob();
    const cv = document.createElement('canvas');
    cv.width = c.img.naturalWidth; cv.height = c.img.naturalHeight;
    cv.getContext('2d').drawImage(c.img, 0, 0);
    const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
    cv.width = 0;
    if (!blob) throw new Error('Das Bild ist nicht lesbar.');
    return blob;
  }
  // Ein Bild aus der Zwischenablage (Async Clipboard API: Desktop-App, Browser, iPad mit Rückfrage "Einsetzen")
  async function bildAusZwischenablage() {
    if (!navigator.clipboard || !navigator.clipboard.read) throw new Error('Die Zwischenablage ist hier nicht lesbar. Versuch es mit Strg+V.');
    let eintraege;
    try { eintraege = await navigator.clipboard.read(); } catch (e) { throw new Error('Die Zwischenablage konnte nicht gelesen werden. Versuch es mit Strg+V.'); }
    for (const it of eintraege) {
      const typ = it.types.find(t => /^image\//.test(t));
      if (typ) return it.getType(typ);
    }
    return null;
  }
  // Dateiauswahl für ein Bild (am Computer der Dialog "Öffnen", auf dem iPad Fotos oder Dateien)
  function waehleBildDatei() {
    return new Promise(ok => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.hidden = true;
      document.body.appendChild(inp);
      const fertig = () => { const f = inp.files && inp.files[0]; inp.remove(); ok(f || null); };
      inp.addEventListener('change', fertig, { once: true });
      inp.addEventListener('cancel', fertig, { once: true });
      inp.click();
    });
  }

  // Für den Verlauf (Rückgängig) werden Seiten als Text kopiert. Ein Bild ist oft einige hundert KB gross: im Text steht
  // dafür nur ein kurzes Zeichen, die Daten selbst liegen einmal in bildZeichen. Seiten ohne Bilder bleiben beim schnellen
  // JSON.stringify ohne Ersetzer.
  const bildZeichen = new Map(), zeichenBild = new Map();
  function ersetzeSrc(k, v) {
    if (k !== 'src' || typeof v !== 'string' || v.length < 256) return v;
    let z = bildZeichen.get(v);
    if (!z) { z = 'lhbild:' + (bildZeichen.size + 1); bildZeichen.set(v, z); zeichenBild.set(z, v); }
    return z;
  }
  const alsText = o => (o && ((o.e && o.e.some(istBild)) || istBild(o)) ? JSON.stringify(o, ersetzeSrc) : JSON.stringify(o));
  const ausText = j => (j.includes('"lhbild:') ? JSON.parse(j, (k, v) => (k === 'src' && zeichenBild.has(v) ? zeichenBild.get(v) : v)) : JSON.parse(j));
  // Stand einer Seite für den Verlauf: der Text jedes Elements einzeln (Schnappschuss). Striche merken sich ihren Text
  // (daten.js strichText, derselbe Speicher wie beim Speichern), solange sie sich nicht ändern. So kostet ein Schritt
  // (Radieren, Verschieben, Löschen) auf einer vollen Seite fast nichts mehr statt mehrmals rund 15 ms für die ganze
  // Seite als Text, und 80 Schritte im Verlauf teilen sich die Texte der unveränderten Striche, statt je zwei ganze
  // Seiten zu halten.
  const elText = el => { const t = window.Daten && Daten.strichText ? Daten.strichText(el) : null; return t != null ? t : alsText(el); };
  const schnapp = inh => ({ t: inh.e.map(elText), ids: inh.e.map(e => e.id), x: inh.x && Object.keys(inh.x).length ? JSON.stringify(inh.x) : '' });
  function gleicherSchnapp(a, b) {
    if (a.x !== b.x || a.t.length !== b.t.length) return false;
    for (let i = 0; i < a.t.length; i++) if (a.t[i] !== b.t[i]) return false;
    return true;
  }
  // Kennung -> Text der Elemente eines Schnappschusses
  const texteVon = sn => { const m = new Map(); for (let i = 0; i < sn.t.length; i++) m.set(sn.ids[i], sn.t[i]); return m; };
  // Seite aus einem Schnappschuss; Elemente von "jetzt", die noch genau so aussehen, bleiben dieselben (kein Einlesen,
  // ihre gebauten Pfade bleiben gültig)
  function ausSchnapp(sn, jetzt) {
    const da = new Map();
    for (const el of (jetzt && jetzt.e) || []) { const t = elText(el); if (!da.has(t)) da.set(t, el); }
    const e = sn.t.map(t => { const el = da.get(t); if (el) { da.delete(t); return el; } return ausText(t); });
    const r = { e };
    if (sn.x) r.x = JSON.parse(sn.x);
    return r;
  }

  new MutationObserver(() => { leseThema(); alleLeinwaende.forEach(l => l.plane()); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-bib-hg'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (typeof textSpeicher !== 'undefined') textSpeicher.clear(); alleLeinwaende.forEach(l => l.plane()); });

  const flaecheThema = () => (thema.hell ? 'hell' : 'dunkel');
  // Eigene Farben (#rrggbb) gelten auf jedem Papier, die Grundfarben passen sich hell/dunkel an
  const tintenFarbe = (name, fl) => {
    if (istHex(name)) return name;
    const t = TINTE[fl] || TINTE.hell;
    return t[name] || t.tinte;
  };
  const farbeVon = (s, fl) => (s.w === 'marker' && MARKER[s.f] ? MARKER[s.f] : tintenFarbe(s.f, fl));

  /* ---------- Mauszeiger: ein kleiner Punkt statt des Kreuzes ---------- */

  // Farbe (#rrggbb) zum Weissen hin aufhellen, anteil 0 bis 1
  function aufgehellt(hex, anteil) {
    const n = parseInt(hex.slice(1), 16), mische = c => Math.round(c + (255 - c) * anteil);
    return `rgb(${mische((n >> 16) & 255)}, ${mische((n >> 8) & 255)}, ${mische(n & 255)})`;
  }
  const cursorSpeicher = new Map();
  // CSS-Cursor: ein Punkt in der (aufgehellten) Farbe mit hellem Rand und dünnem dunklem Aussenrand, damit er auf jedem
  // Hintergrund zu sehen ist. durchmesser in Bildschirm-px; ring: nur ein gestrichelter Kreis (Radierer)
  function punktCursor(durchmesser, hex, deckkraft, ring) {
    const d = Math.max(ring ? 8 : 6, Math.min(ring ? 96 : 60, Math.round(durchmesser)));
    const schluessel = [d, hex, deckkraft, ring ? 1 : 0].join('|');
    let c = cursorSpeicher.get(schluessel);
    if (!c) {
      const g = d + 6, m = g / 2;
      const svg = ring
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="${g}" height="${g}" viewBox="0 0 ${g} ${g}"><circle cx="${m}" cy="${m}" r="${d / 2 + 1}" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="3"/><circle cx="${m}" cy="${m}" r="${d / 2 + 1}" fill="none" stroke="${hex}" stroke-width="1.4" stroke-dasharray="4 3"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="${g}" height="${g}" viewBox="0 0 ${g} ${g}"><circle cx="${m}" cy="${m}" r="${d / 2 + 1.4}" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="1"/><circle cx="${m}" cy="${m}" r="${d / 2}" fill="${aufgehellt(hex, 0.42)}" fill-opacity="${deckkraft}" stroke="rgba(255,255,255,.95)" stroke-width="1.4"/></svg>`;
      c = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${m} ${m}, crosshair`;
      if (cursorSpeicher.size > 300) cursorSpeicher.clear();
      cursorSpeicher.set(schluessel, c);
    }
    return c;
  }

  /* ---------- Text ---------- */

  // Gleiche Schrift auf der Schreibfläche und im Eingabefeld (style.css .lw-text-editor), damit beim Bearbeiten nichts springt
  const TEXT_SCHRIFT = '"Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const TEXT_ZEILE = 1.3;             // Zeilenhöhe im Verhältnis zur Schriftgrösse
  const TEXT_STANDARD = 18 * 96 / 72; // 18 pt
  const textMass = document.createElement('canvas').getContext('2d');
  const textSpeicher = new Map();
  // Umbruch wie im Eingabefeld (white-space: pre-wrap): an Leerzeichen, ein zu langes Wort in Stücken; Zeilenumbrüche
  // aus dem Text bleiben. Ergebnis zwischengespeichert: { zeilen, b (breiteste Zeile), h, umgebrochen }
  function textLayout(e) {
    const gr = e.gr || TEXT_STANDARD, max = Math.max(gr, e.b || 600), t = String(e.t || '');
    const schluessel = gr + '|' + max + '|' + t;
    let r = textSpeicher.get(schluessel);
    if (r) return r;
    textMass.font = `${gr}px ${TEXT_SCHRIFT}`;
    const w = z => textMass.measureText(z).width;
    const zeilen = [];
    let umgebrochen = false;
    for (const absatz of t.split('\n')) {
      let z = '';
      for (const teil of absatz.split(/(\s+)/)) {
        if (!teil) continue;
        if (z && !/^\s+$/.test(teil) && w(z + teil) > max) { zeilen.push(z.replace(/\s+$/, '')); z = teil; umgebrochen = true; }
        else z += teil;
        // Ein Wort, das allein nicht in die Zeile passt: Zeichen für Zeichen umbrechen
        while (z.length > 1 && w(z.replace(/\s+$/, '')) > max) {
          let n = z.length - 1;
          while (n > 1 && w(z.slice(0, n)) > max) n--;
          zeilen.push(z.slice(0, n)); z = z.slice(n); umgebrochen = true;
        }
      }
      zeilen.push(z.replace(/\s+$/, ''));
    }
    let breit = 0;
    for (const z of zeilen) breit = Math.max(breit, w(z));
    r = { zeilen, b: Math.max(gr * 0.5, breit), h: zeilen.length * gr * TEXT_ZEILE, umgebrochen };
    if (textSpeicher.size > 800) textSpeicher.clear();
    textSpeicher.set(schluessel, r);
    return r;
  }
  function malText(ctx, e, farbe) {
    const L = textLayout(e), gr = e.gr || TEXT_STANDARD, zh = gr * TEXT_ZEILE;
    ctx.save();
    ctx.font = `${gr}px ${TEXT_SCHRIFT}`;
    ctx.fillStyle = farbe;
    ctx.textBaseline = 'middle';
    L.zeilen.forEach((z, i) => { if (z) ctx.fillText(z, e.x, e.y + zh * (i + 0.5)); });
    ctx.restore();
  }
  // Schriften kommen manchmal erst nach dem ersten Malen an: dann stimmen die Breiten nicht mehr
  if (document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', () => { textSpeicher.clear(); alleLeinwaende.forEach(l => l.plane()); });
  }

  /* ---------- Zeichnen einzelner Elemente (auch für Vorschaubilder und Export) ---------- */

  // Leichter Druck gibt feine, fester Druck dicke Linien. Starke Neigung (flach gehaltener Stift) macht den Strich
  // etwas breiter, wie die Seite einer Bleistiftmine. Durchsichtig wird er dabei nie: Tinte bleibt satt, beim
  // Schreiben genau wie danach (früher machte die Neigung den Strich bis 45 % durchsichtig, mit dem Apple Pencil in
  // normaler Schreibhaltung fast immer).
  const NEIGUNG_BREITE = 0.9;
  const DRUCK_STUFEN = 32, NEIGUNG_STUFEN = 7;   // so fein wird beides gespeichert (siehe format.js)
  const breite = (s, druck, neigung) => {
    if (s.w === 'marker') return s.d * 4;
    const b = s.d * (0.2 + 1.5 * Math.pow(druck == null ? 0.5 : druck, 0.8));
    return neigung ? b * (1 + NEIGUNG_BREITE * neigung) : b;
  };
  const neigungAlpha = () => 1;
  // Breite im Verhältnis zur Dicke aus dem Druck und zurück (wie in breite)
  const breiteVonDruck = p => 0.2 + 1.5 * Math.pow(p, 0.8);
  const druckVonBreite = w => Math.pow(Math.max(0, w - 0.2) / 1.5, 1.25);
  // Punkt mit neuer Lage, Druck und Neigung bleiben erhalten
  const punktMit = (q, x, y) => (q.length > 3 ? [x, y, q[2], q[3]] : [x, y, q[2]]);


  // Neigung des Stifts in Grad von der Senkrechten (0 = aufrecht, 90 = flach), aus tiltX/tiltY oder der Höhe über dem Blatt
  function neigungWinkel(e) {
    const tx = e.tiltX || 0, ty = e.tiltY || 0;
    if (!tx && !ty) {
      return e.altitudeAngle != null && e.altitudeAngle < Math.PI / 2 - 1e-3 ? (Math.PI / 2 - e.altitudeAngle) * 180 / Math.PI : 0;
    }
    const a = Math.tan(tx * Math.PI / 180), c = Math.tan(ty * Math.PI / 180);
    return Math.atan(Math.sqrt(a * a + c * c)) * 180 / Math.PI;
  }
  // Gewohnter Schreibdruck, wenn noch nichts gelernt ist, und wie stark ein Strich ihn nachführt
  const DRUCK_TYPISCH = 0.4, DRUCK_LERNEN = 0.05, DRUCK_STEIL = 1.2;
  const druckTypisch = einst => Math.max(0.12, Math.min(0.75, Number(einst.druckTypisch) || DRUCK_TYPISCH));
  // Gemeldeter Druck (0..1) -> Druck für den Strich.
  // Wie Apple Pencil (druckModus 'pencil', Standard): keine Schwelle, eine gleichmässige Kurve, auf der der gewohnte
  // Schreibdruck dieses Stifts (einst.druckTypisch, lernt sich beim Schreiben) die mittlere Breite gibt; leicht
  // aufgesetzt wird es fein, fest gedrückt dick. So fühlt sich jeder Stift gleich an, egal welche Werte sein Treiber meldet.
  // Eigene Kurve (druckModus 'eigen'): unterhalb von druckMin ist es leicht, ab druckMax voll; druckKurve > 1 verlangt
  // mehr Druck für dicke Linien, < 1 weniger.
  function druckAbbildung(roh, einst) {
    if (einst.druckModus !== 'eigen') {
      // DRUCK_STEIL > 1: um den gewohnten Druck herum ändert sich die Breite deutlich, ganz fest gedrückt ist sie voll
      return Math.max(0.03, Math.min(1, 0.5 * Math.pow(Math.max(0, roh) / druckTypisch(einst), DRUCK_STEIL)));
    }
    const lo = Math.max(0, Math.min(0.9, Number(einst.druckMin) || 0));
    const hi = Math.max(lo + 0.05, Math.min(1, Number(einst.druckMax) || 1));
    const p = Math.max(0, Math.min(1, (roh - lo) / (hi - lo)));
    return Math.max(0.03, Math.pow(p, Number(einst.druckKurve) > 0 ? Number(einst.druckKurve) : 1));
  }
  // Was der Stift meldet, für die Diagnose
  const stiftDaten = e => ({
    typ: e.pointerType, druck: e.pressure, tiltX: e.tiltX || 0, tiltY: e.tiltY || 0, twist: e.twist || 0,
    neigung: Math.round(neigungWinkel(e)), tasten: e.buttons, zeit: e.timeStamp
  });

  // Ein Strich ist eine Kurve DURCH seine Punkte (Catmull-Rom, als kubische Bézier-Stücke). Abschnitt k läuft von Punkt
  // k zu Punkt k + 1; seine Richtung an den Enden kommt von den Nachbarn k - 1 und k + 2. Er ist also fertig, sobald
  // Punkt k + 2 da ist (oder der Strich zu Ende): beim Schreiben wird Stück für Stück gezeichnet, das letzte Stück bis
  // unter den Stift malt die Ebene "spitze". Weil die Kurve durch die Punkte geht, sieht ein Strich nach dem Absetzen
  // genauso aus wie beim Schreiben: Ecken und Spitzen bleiben, wo sie waren. (Früher lief die Kurve durch die Mitten
  // zwischen den Punkten und schnitt Ecken ab.) Das Zittern nimmt die Glättung beim Festlegen der Punkte weg
  // (festerPunkt), nicht das Zeichnen. Abschnitte: 0 … n - 2.
  // Kontrollpunkte des Abschnitts k; die Länge der Tangenten ist auf die halbe Abschnittslänge begrenzt, damit die
  // Kurve an engen Wendungen keine Schleifen schlägt. Knickt die Linie an einem Punkt scharf ab (mehr als 75°), ist er
  // eine Ecke: dort läuft die Kurve gerade hinein und heraus, so bleiben Spitzen spitz und Kanten gerade.
  const ECKE_COS = Math.cos(75 * Math.PI / 180);
  const istEcke = (a, b, c) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    return l > 0 && (ux * vx + uy * vy) / l < ECKE_COS;
  };
  function crStueck(p, k) {
    const n = p.length, P1 = p[k], P2 = p[k + 1], P0 = p[k > 0 ? k - 1 : k], P3 = p[k + 2 < n ? k + 2 : k + 1];
    const l = Math.hypot(P2[0] - P1[0], P2[1] - P1[1]);
    let ax = (P2[0] - P0[0]) / 6, ay = (P2[1] - P0[1]) / 6, bx = (P3[0] - P1[0]) / 6, by = (P3[1] - P1[1]) / 6;
    if (k > 0 && istEcke(P0, P1, P2)) ax = ay = 0;
    if (k + 2 < n && istEcke(P1, P2, P3)) bx = by = 0;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by), grenze = l * 0.5;
    if (la > grenze && la > 0) { ax *= grenze / la; ay *= grenze / la; }
    if (lb > grenze && lb > 0) { bx *= grenze / lb; by *= grenze / lb; }
    return [P1[0], P1[1], P1[0] + ax, P1[1] + ay, P2[0] - bx, P2[1] - by, P2[0], P2[1]];
  }
  // Abschnitte von bis (ohne bis) eines Stiftstrichs als EINE gefüllte Fläche, wie Tinte: an Punkten der Kurve je ein
  // Kreis mit der halben Breite, dazwischen ein Viereck, das zwei Kreise verbindet. Alle Teile laufen gleich herum,
  // die Füllung (nonzero) vereint sie ohne Nähte. Die Breite läuft von Punkt zu Punkt gleichmässig. (Früher wurde jedes
  // Stück mit eigener Linienbreite einzeln gezogen; an jeder Naht lagen die weichen Kanten doppelt, dicke Linien
  // bekamen einen welligen, perligen Rand.)
  function malAbschnitte(ctx, s, von, bis) {
    for (const t of baueTeile(s, von, bis)) malTeil(ctx, t);
    ctx.globalAlpha = 1;
  }
  function malTeil(ctx, t) {
    ctx.globalAlpha = t.a;
    if (t.fuellen) ctx.fill(t.pfad);
    else { ctx.lineWidth = t.w; ctx.stroke(t.pfad); }
  }
  function baueTeile(s, von, bis) {
    const p = s.p, n = p.length, a = Math.max(0, von), z = Math.min(bis, n - 1);
    // Überall gleich breit (Formen, Maus, Stift ohne Druck): eine Linie mit runden Enden und Ecken. Das sieht genauso aus
    // wie die Fläche, kostet aber weniger (eine Kurve statt Bänder und Kreise).
    if (n > 1 && z > a && gleichBreit(p)) {
      const pfad = new Path2D();
      for (let k = a; k < z; k++) {
        const c = crStueck(p, k);
        if (k === a) pfad.moveTo(c[0], c[1]);
        pfad.bezierCurveTo(c[2], c[3], c[4], c[5], c[6], c[7]);
      }
      return [{ w: breite(s, p[0][2], s.w === 'marker' ? 0 : p[0][3] || 0), a: 1, pfad }];
    }
    const pfad = new Path2D();
    fuelleStrich(pfad, strichProben(s, von, bis));
    return [{ fuellen: true, a: 1, pfad }];
  }
  function gleichBreit(p) {
    const d = p[0][2], t = p[0][3] || 0;
    for (let i = 1; i < p.length; i++) if (p[i][2] !== d || (p[i][3] || 0) !== t) return false;
    return true;
  }
  // Proben [x, y, Radius] entlang der Abschnitte von bis: so viele je Abschnitt, dass die Kurve rund bleibt (eine je 6°
  // Richtungsänderung, höchstens 12), der Radius dazwischen linear
  const radiusBei = (s, k) => breite(s, s.p[k][2], s.w === 'marker' ? 0 : s.p[k][3] || 0) / 2;
  // Proben eines Abschnitts an fn(x, y, r); erster: auch den Anfangspunkt des Abschnitts
  function abschnittProben(s, k, erster, fn) {
    const c = crStueck(s.p, k), ra = radiusBei(s, k), rb = radiusBei(s, k + 1);
    if (erster) fn(c[0], c[1], ra);
    const sx = c[6] - c[0], sy = c[7] - c[1];
    const w1 = winkelZwischen(c[2] - c[0], c[3] - c[1], sx, sy), w2 = winkelZwischen(sx, sy, c[6] - c[4], c[7] - c[5]);
    const m = Math.max(1, Math.min(12, Math.ceil((w1 + w2) / 0.105)));
    for (let i = 1; i <= m; i++) {
      const t = i / m, u = 1 - t;
      fn(u * u * u * c[0] + 3 * u * u * t * c[2] + 3 * u * t * t * c[4] + t * t * t * c[6],
        u * u * u * c[1] + 3 * u * u * t * c[3] + 3 * u * t * t * c[5] + t * t * t * c[7],
        ra + (rb - ra) * t);
    }
  }
  function strichProben(s, von, bis) {
    const p = s.p, n = p.length, raus = [];
    if (n === 1) return [[p[0][0], p[0][1], radiusBei(s, 0)]];
    const fn = (x, y, r) => { raus.push([x, y, r]); };
    for (let k = Math.max(0, von); k < Math.min(bis, n - 1); k++) abschnittProben(s, k, !raus.length, fn);
    return raus;
  }
  function winkelZwischen(ax, ay, bx, by) {
    const l = Math.hypot(ax, ay) * Math.hypot(bx, by);
    return l > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / l))) : 0;
  }
  // Fläche aus den Proben: Bänder, deren Ränder links und rechts im Abstand des Radius neben der Kurve laufen, und Kreise
  // an den Enden und dort, wo ein Band brechen muss (Knick über 8° oder eine Biegung enger als der Strich breit ist,
  // sonst überschlüge sich der innere Rand). Innerhalb eines Bandes gibt es keine inneren Kanten; wo zwei Bänder
  // aneinanderstossen, deckt der Kreis die Naht. (Einzelne Vierecke je Stück zeigten an jeder Stossfuge eine feine helle
  // Linie quer durch den Strich.)
  // Gebaut wird Probe für Probe (StrichBau): was einmal fertig ist, ändert sich nicht mehr, nur das letzte offene Band
  // wächst. So muss beim Schreiben nicht in jedem Bild der ganze Strich neu aufgebaut und gefüllt werden, sondern nur
  // das Ende (zeichneLiveStrich); ein Band ist deshalb höchstens BAND_MAX Proben lang. Beim Schreiben und danach
  // entstehen dieselben Teile, das Bild ist also dasselbe (test/strich.js).
  const KNICK_COS = Math.cos(8 * Math.PI / 180);
  const BAND_MAX = 28;
  function StrichBau() {
    const c = [], ux = [], uy = [], l = [];   // Proben [x, y, r], Richtung und Länge des Stücks hinter jeder Probe
    const teile = [];                         // fertig: { r: Radius (Kreis), x, y } oder { v: [x0, y0, x1, y1, …] }, mit Kasten
    let start = 0;
    const kreis = i => { const q = c[i], r = q[2]; return { r, x: q[0], y: q[1], x1: q[0] - r, y1: q[1] - r, x2: q[0] + r, y2: q[1] + r }; };
    // Band von Probe a bis b: die eine Seite vorwärts, die andere rückwärts (läuft so gleich herum wie die Kreise)
    const band = (a, b) => {
      const n = b - a + 1, v = new Array(n * 4);
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (let k = a; k <= b; k++) {
        let ex, ey;
        if (k === a) { ex = -uy[k]; ey = ux[k]; }
        else if (k === b) { ex = -uy[k - 1]; ey = ux[k - 1]; }
        else { ex = -(uy[k - 1] + uy[k]); ey = ux[k - 1] + ux[k]; const e = Math.hypot(ex, ey) || 1; ex /= e; ey /= e; }
        const q = c[k], r = q[2], i = (k - a) * 2, j = (2 * n - 1 - (k - a)) * 2;
        const lx = q[0] - ex * r, ly = q[1] - ey * r, rx = q[0] + ex * r, ry = q[1] + ey * r;
        v[i] = lx; v[i + 1] = ly; v[j] = rx; v[j + 1] = ry;
        if (lx < x1) x1 = lx; if (lx > x2) x2 = lx; if (ly < y1) y1 = ly; if (ly > y2) y2 = ly;
        if (rx < x1) x1 = rx; if (rx > x2) x2 = rx; if (ry < y1) y1 = ry; if (ry > y2) y2 = ry;
      }
      return { v, x1, y1, x2, y2 };
    };
    const bricht = i => {
      if (i - start >= BAND_MAX) return true;
      const cos = ux[i - 1] * ux[i] + uy[i - 1] * uy[i];
      if (cos < KNICK_COS) return true;
      const w = Math.acos(Math.min(1, cos));
      return w > 1e-6 && (l[i - 1] + l[i]) / 2 / w < c[i][2] * 1.3;
    };
    return {
      teile,
      // Nächste Probe. Liegt sie auf der letzten, bleibt nur der grössere Radius.
      probe(x, y, r) {
        const m = c.length, v = m ? c[m - 1] : null;
        if (v && Math.abs(x - v[0]) + Math.abs(y - v[1]) < 1e-4) { if (r > v[2]) v[2] = r; return; }
        c.push([x, y, r]);
        if (!m) return;
        const dx = x - v[0], dy = y - v[1], d = Math.hypot(dx, dy);
        ux.push(dx / d); uy.push(dy / d); l.push(d);
        // Der Anfangskreis steht fest, sobald die zweite Probe da ist; ob an Probe m - 1 gebrochen wird, sobald die
        // Richtung hinter ihr bekannt ist
        if (m === 1) { if (c[0][2] > 0) teile.push(kreis(0)); return; }
        const i = m - 1;
        if (bricht(i)) {
          teile.push(band(start, i));
          if (c[i][2] > 0) teile.push(kreis(i));
          start = i;
        }
      },
      // Das offene Ende, so wie es jetzt aussähe: das letzte Band und der Kreis am Schluss (nicht gemerkt)
      schluss() {
        const n = c.length, raus = [];
        if (!n) return raus;
        if (n === 1) { if (c[0][2] > 0) raus.push(kreis(0)); return raus; }
        raus.push(band(start, n - 1));
        if (c[n - 1][2] > 0) raus.push(kreis(n - 1));
        return raus;
      }
    };
  }
  // Ein Teil in einen Pfad (Path2D oder alles mit moveTo/lineTo/arc/closePath) oder an eigene Zeichner
  function teilInPfad(pfad, t) {
    if (t.v) {
      const v = t.v;
      pfad.moveTo(v[0], v[1]);
      for (let i = 2; i < v.length; i += 2) pfad.lineTo(v[i], v[i + 1]);
      pfad.closePath();
    } else { pfad.moveTo(t.x + t.r, t.y); pfad.arc(t.x, t.y, t.r, 0, Math.PI * 2); }
  }
  function fuelleStrich(pfad, q, kreis, vieleck) {
    const bau = StrichBau();
    for (const p of q) bau.probe(p[0], p[1], p[2]);
    const aus = t => {
      if (t.v) {
        if (!vieleck) { teilInPfad(pfad, t); return; }
        const pts = [];
        for (let i = 0; i < t.v.length; i += 2) pts.push([t.v[i], t.v[i + 1]]);
        vieleck(pts);
      } else if (kreis) kreis(t.x, t.y, t.r);
      else teilInPfad(pfad, t);
    };
    bau.teile.forEach(aus);
    bau.schluss().forEach(aus);
  }
  // Der Strich unter dem Stift, Stück für Stück gebaut. erweitere(bis) nimmt die Abschnitte bis "bis" (ohne) dazu und
  // gibt den Kasten zurück, in dem sich das Bild geändert hat (Einheiten des Strichs; null: nichts). pfad(k) ist ein
  // Pfad aus allem, was in einen Kasten ragt (auch ältere Teile, wenn der Strich sich dort kreuzt): in einem Zug
  // gefüllt, gibt es keine Nähte. Überall gleich breite Striche (Maus, Kugelschreiber, Formen) sind eine Linie mit
  // runden Enden, alle anderen eine Fläche.
  function LiveStrich(s) {
    const p = s.p;
    let gleich = true, geprueft = 1, seg = 0, bau = StrichBau(), schluss = [], kurven = [], alles = true;
    const kasten = (k, t) => { if (t.x1 < k.x1) k.x1 = t.x1; if (t.y1 < k.y1) k.y1 = t.y1; if (t.x2 > k.x2) k.x2 = t.x2; if (t.y2 > k.y2) k.y2 = t.y2; };
    const probe = (x, y, r) => bau.probe(x, y, r);
    const linienBreite = () => breite(s, p[0][2], s.w === 'marker' ? 0 : p[0][3] || 0);
    return {
      p,
      linie: () => gleich,
      breite: linienBreite,
      // Die Ebene wurde geleert: beim nächsten Mal alles malen
      vonVorn() { alles = true; },
      erweitere(bis) {
        // Bleibt der Strich überall gleich breit? (geprüft werden wie beim fertigen Strich alle Punkte)
        const warGleich = gleich;
        for (; geprueft < p.length && gleich; geprueft++) if (p[geprueft][2] !== p[0][2] || (p[geprueft][3] || 0) !== (p[0][3] || 0)) gleich = false;
        const k = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
        // Aus der Linie wird eine Fläche: von vorn bauen, und was von der Linie schon gemalt ist, gehört zum Bereich
        if (warGleich && !gleich) { for (const q of kurven) kasten(k, q); seg = 0; kurven = []; alles = true; }
        bis = Math.min(bis, p.length - 1);
        if (gleich) {
          const r = linienBreite() / 2;
          // Der letzte Abschnitt bekommt statt des runden Endes eine Verbindung: sein Bereich gehört dazu
          const ab = Math.max(0, seg - 1);
          for (; seg < bis; seg++) {
            const c = crStueck(p, seg);
            kurven.push({ c, x1: Math.min(c[0], c[2], c[4], c[6]) - r, y1: Math.min(c[1], c[3], c[5], c[7]) - r, x2: Math.max(c[0], c[2], c[4], c[6]) + r, y2: Math.max(c[1], c[3], c[5], c[7]) + r });
          }
          for (let i = alles ? 0 : ab; i < kurven.length; i++) kasten(k, kurven[i]);
        } else {
          const vorher = bau.teile.length, alt = schluss;
          if (seg >= bis && !alles) return null;
          for (; seg < bis; seg++) abschnittProben(s, seg, seg === 0, probe);
          schluss = bau.schluss();
          for (const t of alt) kasten(k, t);
          for (let i = alles ? 0 : vorher; i < bau.teile.length; i++) kasten(k, bau.teile[i]);
          for (const t of schluss) kasten(k, t);
        }
        alles = false;
        return k.x1 <= k.x2 ? k : null;
      },
      // Alles, was in den Kasten ragt, in einen Pfad (Fläche: füllen, Linie: ziehen)
      pfad(k) {
        const pf = new Path2D();
        const drin = t => t.x2 >= k.x1 && t.x1 <= k.x2 && t.y2 >= k.y1 && t.y1 <= k.y2;
        if (gleich) {
          let offen = false;
          for (const q of kurven) {
            if (!drin(q)) { offen = false; continue; }
            const c = q.c;
            if (!offen) { pf.moveTo(c[0], c[1]); offen = true; }
            pf.bezierCurveTo(c[2], c[3], c[4], c[5], c[6], c[7]);
          }
        } else {
          for (const t of bau.teile) if (drin(t)) teilInPfad(pf, t);
          for (const t of schluss) if (drin(t)) teilInPfad(pf, t);
        }
        return pf;
      }
    };
  }
  // Fertige Striche merken sich ihre Pfade: beim Neumalen (Scrollen, Zoomen) werden sie nur noch übergeben, statt jedes
  // Mal Punkt für Punkt neu aufgebaut zu werden (test/leistung.js). Ändert sich der Strich (Verschieben ändert die
  // Punkte, Skalieren und Drehen ersetzen sie, Dicke), passt die Kennung nicht mehr und der Pfad wird neu gebaut.
  const pfadSpeicher = new WeakMap();
  function teileVon(s) {
    const p = s.p, n = p.length, l = p[n - 1];
    const z = pfadSpeicher.get(s);
    if (z && z.p === p && z.n === n && z.d === s.d && z.w === s.w && z.x === p[0][0] && z.y === p[0][1] && z.lx === l[0] && z.ly === l[1]) return z.teile;
    const teile = s.w === 'marker' ? markerTeile(s) : baueTeile(s, 0, n - 1);
    pfadSpeicher.set(s, { p, n, d: s.d, w: s.w, x: p[0][0], y: p[0][1], lx: l[0], ly: l[1], teile });
    return teile;
  }
  // Textmarker in einem Zug, damit sich die Transparenz nicht aufaddiert
  function markerTeile(s) {
    const p = s.p, pfad = new Path2D();
    pfad.moveTo(p[0][0], p[0][1]);
    if (p.length === 1) pfad.lineTo(p[0][0] + 0.1, p[0][1]);
    else for (let k = 0; k < p.length - 1; k++) { const c = crStueck(p, k); pfad.bezierCurveTo(c[2], c[3], c[4], c[5], c[6], c[7]); }
    return [{ w: breite(s, 0.5), a: 0.35, pfad }];
  }

  function malStrich(ctx, s, farbe) {
    const p = s.p;
    if (!p || !p.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = farbe;
    if (p.length === 1 && s.w !== 'marker') {
      ctx.beginPath();
      ctx.arc(p[0][0], p[0][1], breite(s, p[0][2], p[0][3]) / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (const t of teileVon(s)) malTeil(ctx, t);
    }
    ctx.restore();
  }

  function rundesRechteck(ctx, x, y, b, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, b, h, r);
    else ctx.rect(x, y, b, h);
  }

  // Text in Zeilen umbrechen, die in die Breite passen
  function zeilen(ctx, text, maxB) {
    const r = [];
    for (const absatz of String(text || '').split('\n')) {
      const woerter = absatz.split(/(\s+)/);
      let zeile = '';
      for (const w of woerter) {
        const probe = zeile + w;
        if (ctx.measureText(probe).width > maxB && zeile.trim()) { r.push(zeile.trimEnd()); zeile = w.trimStart(); }
        else zeile = probe;
        // Sehr lange Wörter hart trennen
        while (ctx.measureText(zeile).width > maxB && zeile.length > 1) {
          let n = zeile.length - 1;
          while (n > 1 && ctx.measureText(zeile.slice(0, n)).width > maxB) n--;
          r.push(zeile.slice(0, n));
          zeile = zeile.slice(n);
        }
      }
      r.push(zeile);
    }
    return r;
  }

  const SCHRIFT = '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';

  // Haftnotiz: Kopfleiste, Text und die Zeichnungen darauf (Striche in Koordinaten der Notiz).
  // bedienung: Knöpfe zum Zuklappen, ⋯ und die Ecke zum Grösserziehen (nur auf der Schreibfläche, nicht im Export)
  function malNotiz(ctx, n, mitText, bedienung) {
    const { b, h } = sicht(n);
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, .22)';
    rundesRechteck(ctx, n.x + 2, n.y + 4, b, h, n.zu ? 6 : 7);
    ctx.fill();
    ctx.fillStyle = NOTIZFARBEN[n.f] || NOTIZFARBEN.gelb;
    rundesRechteck(ctx, n.x, n.y, b, h, n.zu ? 6 : 7);
    ctx.fill();
    if (n.zu) {
      // Zugeklappt: kleines Quadrat mit Eselsohr und angedeuteten Zeilen, Inhalt bleibt gespeichert
      const k = 11;
      ctx.fillStyle = 'rgba(0, 0, 0, .14)';
      ctx.beginPath(); ctx.moveTo(n.x + b - k, n.y + b); ctx.lineTo(n.x + b, n.y + b - k); ctx.lineTo(n.x + b - k, n.y + b - k); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(27, 34, 50, .45)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [y, l] of [[10, 18], [17, 18], [24, 11]]) { ctx.moveTo(n.x + 9, n.y + y); ctx.lineTo(n.x + 9 + l, n.y + y); }
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.clip();
    ctx.fillStyle = 'rgba(0, 0, 0, .07)';
    ctx.fillRect(n.x, n.y, b, NOTIZ_KOPF);
    {
      if (mitText !== false && n.t) {
        const gr = n.gr || 18;
        ctx.fillStyle = '#1b2232';
        ctx.font = `${gr}px ${SCHRIFT}`;
        ctx.textBaseline = 'top';
        const zh = gr * 1.3;
        zeilen(ctx, n.t, b - 1.4 * gr).forEach((z, i) => ctx.fillText(z, n.x + gr * 0.7, n.y + NOTIZ_KOPF + gr * 0.3 + i * zh));
      }
      if (n.e && n.e.length) {
        ctx.translate(n.x, n.y);
        for (const s of n.e) malStrich(ctx, s, farbeVon(s, 'hell'));
        ctx.translate(-n.x, -n.y);
      }
    }
    if (bedienung) malNotizKnoepfe(ctx, n, b, h);
    ctx.restore();
  }

  function malNotizKnoepfe(ctx, n, b, h) {
    const m = n.y + NOTIZ_KOPF / 2;
    ctx.strokeStyle = ctx.fillStyle = 'rgba(27, 34, 50, .6)';
    ctx.lineWidth = 1.8;
    ctx.lineCap = ctx.lineJoin = 'round';
    // ⋯
    const px = n.x + b - 13;
    for (const d of [-5, 0, 5]) { ctx.beginPath(); ctx.arc(px + d, m, 1.7, 0, Math.PI * 2); ctx.fill(); }
    // Zuklappen (Pfeil nach oben)
    const cx = n.x + b - 37;
    ctx.beginPath();
    ctx.moveTo(cx - 5, m + 2.5); ctx.lineTo(cx, m - 2.5); ctx.lineTo(cx + 5, m + 2.5);
    ctx.stroke();
    // Ecke zum Grösserziehen
    const ex = n.x + b, ey = n.y + h;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ex - 4, ey - 13); ctx.lineTo(ex - 13, ey - 4);
    ctx.moveTo(ex - 4, ey - 8); ctx.lineTo(ex - 8, ey - 4);
    ctx.stroke();
  }

  // Papier eines Notizbuchs: kariert, liniert, gepunktet oder blanko
  function malVorlage(ctx, seite, y0, y1, fl, s) {
    const art = seite.papier || 'karo';
    if (art === 'blanko') return;
    const mm = seite.b / (seite.mm || 210);
    const farbe = LINIEN[fl];
    const px = 1 / s;
    ctx.save();
    if (art === 'karo' || art === 'karofein' || art === 'punkte') {
      // Das Raster passt genau auf das Blatt: Kästchen von 5 mm (fein 3 mm), die Anzahl geht ohne Rest auf, die Zellen
      // werden dafür um höchstens ein paar Hundertstel Millimeter gestreckt (A4: 42 x 59 Kästchen). Kein angeschnittenes
      // Kästchen am Rand, die erste und letzte Linie ist der Blattrand selbst.
      const soll = (art === 'karofein' ? 3 : 5) * mm;
      const nx = Math.max(1, Math.round(seite.b / soll)), ny = Math.max(1, Math.round(seite.h / soll));
      const sx = seite.b / nx, sy = seite.h / ny;
      if (Math.min(sx, sy) * s < 3.5) { ctx.restore(); return; }
      const j0 = Math.max(1, Math.floor(y0 / sy)), j1 = Math.min(ny - 1, Math.ceil(y1 / sy));
      if (art !== 'punkte') {
        ctx.strokeStyle = farbe;
        ctx.lineWidth = px;
        ctx.beginPath();
        for (let i = 1; i < nx; i++) { ctx.moveTo(i * sx, Math.max(0, y0)); ctx.lineTo(i * sx, Math.min(y1, seite.h)); }
        for (let j = j0; j <= j1; j++) { ctx.moveTo(0, j * sy); ctx.lineTo(seite.b, j * sy); }
        ctx.stroke();
      } else {
        ctx.fillStyle = fl === 'dunkel' ? 'rgba(255, 255, 255, .55)' : 'rgba(60, 90, 140, .38)';
        const r = Math.max(0.9, 1.3 * px);
        for (let j = j0; j <= j1; j++) {
          for (let i = 1; i < nx; i++) { ctx.beginPath(); ctx.arc(i * sx, j * sy, r, 0, Math.PI * 2); ctx.fill(); }
        }
      }
    } else if (art === 'linien') {
      const schritt = 8 * mm, oben = 30 * mm;
      if (schritt * s >= 3) {
        ctx.strokeStyle = farbe;
        ctx.lineWidth = px;
        ctx.beginPath();
        for (let y = oben; y < Math.min(y1, seite.h - 10 * mm); y += schritt) { if (y < y0) continue; ctx.moveTo(0, y); ctx.lineTo(seite.b, y); }
        ctx.stroke();
      }
      ctx.strokeStyle = fl === 'dunkel' ? 'rgba(255, 122, 110, .35)' : 'rgba(208, 52, 44, .32)';
      ctx.lineWidth = 1.2 * px;
      ctx.beginPath();
      ctx.moveTo(25 * mm, Math.max(0, y0));
      ctx.lineTo(25 * mm, Math.min(y1, seite.h));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Raster einer unendlichen Fläche (Whiteboard): kariert (5 mm), Punkte (5 mm), liniert (8 mm) oder leer.
  // Wird beim Herauszoomen gröber (jede fünfte Linie), damit es nicht zu einer Fläche verschwimmt.
  function malBrettRaster(ctx, art, x1, y1, x2, y2, fl, s) {
    if (!art || art === 'blanko') return;
    let schritt = (art === 'linien' ? 8 : 5) * MM;
    while (schritt * s < 6) schritt *= 5;
    const px = 1 / s;
    ctx.save();
    ctx.strokeStyle = LINIEN[fl];
    ctx.fillStyle = fl === 'dunkel' ? 'rgba(255, 255, 255, .55)' : 'rgba(60, 90, 140, .38)';
    ctx.lineWidth = px;
    const xa = Math.floor(x1 / schritt) * schritt, ya = Math.floor(y1 / schritt) * schritt;
    if (art === 'karo') {
      ctx.beginPath();
      for (let x = xa; x <= x2; x += schritt) { ctx.moveTo(x, y1); ctx.lineTo(x, y2); }
      for (let y = ya; y <= y2; y += schritt) { ctx.moveTo(x1, y); ctx.lineTo(x2, y); }
      ctx.stroke();
    } else if (art === 'linien') {
      ctx.beginPath();
      for (let y = ya; y <= y2; y += schritt) { ctx.moveTo(x1, y); ctx.lineTo(x2, y); }
      ctx.stroke();
    } else {
      const r = Math.max(0.9, 1.3 * px);
      ctx.beginPath();
      for (let y = ya; y <= y2; y += schritt) for (let x = xa; x <= x2; x += schritt) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
      ctx.fill();
    }
    ctx.restore();
  }

  // In welcher Farbwelt liegt ein Element: auf einer Haftnotiz (hell), auf der Seite oder daneben
  function flaecheFuer(e, seite, liste, flSeite, flAussen) {
    if (istNotiz(e) || (!istText(e) && (!e.p || !e.p.length))) return 'hell';
    const [x, y] = istText(e) ? [e.x, e.y] : e.p[0];
    for (const n of liste) {
      if (!istNotiz(n)) continue;
      const g = sicht(n);
      if (x >= n.x && x <= n.x + g.b && y >= n.y && y <= n.y + g.h) return 'hell';
    }
    if (seite.unendlich) return flSeite;
    if (x >= 0 && x <= seite.b && y >= 0 && (seite.endlos || y <= seite.h)) return flSeite;
    return flAussen;
  }

  // sichtbar: nur Elemente zeichnen, die in diesen Ausschnitt (Koordinaten der Seite) ragen
  // Bilder liegen immer unter Schrift und Haftnotizen: man schreibt auf ihnen
  function malElemente(ctx, liste, seite, flSeite, flAussen, ausser, bedienung, sichtbar) {
    const zuSehen = e => {
      if (!sichtbar) return true;
      const g = umriss(e);
      return !(g.x2 < sichtbar.x1 || g.x1 > sichtbar.x2 || g.y2 < sichtbar.y1 || g.y1 > sichtbar.y2);
    };
    for (const e of liste) if (istBild(e) && zuSehen(e)) malBildElement(ctx, e);
    for (const e of liste) {
      if (istBild(e) || !zuSehen(e)) continue;
      if (istNotiz(e)) malNotiz(ctx, e, e !== ausser, bedienung);
      else if (istText(e)) { if (e !== ausser) malText(ctx, e, farbeVon(e, flaecheFuer(e, seite, liste, flSeite, flAussen))); }
      else malStrich(ctx, e, farbeVon(e, flaecheFuer(e, seite, liste, flSeite, flAussen)));
    }
  }

  function grenzen(e) {
    if (istNotiz(e)) { const g = sicht(e); return { x1: e.x, y1: e.y, x2: e.x + g.b, y2: e.y + g.h }; }
    if (istBild(e)) return { x1: e.x, y1: e.y, x2: e.x + e.b, y2: e.y + e.h };
    if (istText(e)) { const L = textLayout(e); return { x1: e.x, y1: e.y, x2: e.x + L.b, y2: e.y + Math.max(L.h, (e.gr || TEXT_STANDARD) * TEXT_ZEILE) }; }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, nMax = 0;
    for (const q of e.p) if (q[3] > nMax) nMax = q[3];
    const rand = breite(e, 1, nMax) / 2;
    for (const [x, y] of e.p) {
      if (x - rand < x1) x1 = x - rand;
      if (y - rand < y1) y1 = y - rand;
      if (x + rand > x2) x2 = x + rand;
      if (y + rand > y2) y2 = y + rand;
    }
    return { x1, y1, x2, y2 };
  }

  // Umriss eines Elements (mit Schatten der Haftnotiz), zwischengespeichert: beim Zeichnen wird alles ausserhalb
  // des Bildes übersprungen. Verschieben und Skalieren ändern erste Punkte oder die Punktliste und machen den Eintrag ungültig.
  const umrissSpeicher = new WeakMap();
  function umriss(e) {
    if (istNotiz(e)) { const g = grenzen(e); return { x1: g.x1 - 2, y1: g.y1 - 2, x2: g.x2 + 6, y2: g.y2 + 8 }; }
    if (istBild(e)) { const g = grenzen(e); return { x1: g.x1 - 1, y1: g.y1 - 1, x2: g.x2 + 1, y2: g.y2 + 1 }; }
    if (istText(e)) { const g = grenzen(e), r = (e.gr || TEXT_STANDARD) * 0.3; return { x1: g.x1 - r, y1: g.y1 - r, x2: g.x2 + r, y2: g.y2 + r }; }
    const p = e.p, n = p.length;
    if (!n) return { x1: 0, y1: 0, x2: 0, y2: 0 };
    const z = umrissSpeicher.get(e), l = p[n - 1];
    if (z && z.p === p && z.n === n && z.d === e.d && z.x === p[0][0] && z.y === p[0][1] && z.lx === l[0] && z.ly === l[1]) return z.g;
    const g = grenzen(e);
    umrissSpeicher.set(e, { p, n, d: e.d, x: p[0][0], y: p[0][1], lx: l[0], ly: l[1], g });
    return g;
  }

  // Kleines Bild einer Seite, z. B. für Karten und Konflikt-Dialoge
  function vorschau(cv, inhalt, o = {}) {
    const c = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const liste = (inhalt && inhalt.e) || [];
    const fl = o.flaeche || flaecheThema();
    let bx = 0, by = 0, B = o.b, Hh = o.h;
    if (!B) {
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const e of liste) { const g = grenzen(e); x1 = Math.min(x1, g.x1); y1 = Math.min(y1, g.y1); x2 = Math.max(x2, g.x2); y2 = Math.max(y2, g.y2); }
      if (x1 === Infinity) { x1 = 0; y1 = 0; x2 = 794; y2 = 560; }
      bx = x1 - 20; by = y1 - 20; B = Math.max(200, x2 - x1 + 40); Hh = Math.max(140, y2 - y1 + 40);
    }
    const sc = Math.min(W / B, H / Hh);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);
    c.fillStyle = o.papierFarbe || PAPIER[fl];
    c.fillRect(0, 0, W, H);
    c.setTransform(sc, 0, 0, sc, (W - B * sc) / 2 - bx * sc, o.b ? 0 : (H - Hh * sc) / 2 - by * sc);
    const seite = { b: o.b || 794, h: o.h || 1123, mm: o.mm || 210, papier: o.papier, endlos: !o.b };
    if (o.papier) malVorlage(c, seite, 0, seite.h, fl, sc);
    malElemente(c, liste, seite, fl, fl);
    // Bilder noch nicht dekodiert: sobald sie da sind, das Vorschaubild noch einmal
    if (liste.some(e => istBild(e) && !bildVon(e.src).bereit && !bildVon(e.src).fehler)) bilderBereit(liste).then(() => vorschau(cv, inhalt, o));
  }

  // Bild einer Seite oder eines Ausschnitts (für den PNG-Export). Gibt den Massstab zurück (Pixel je Einheit).
  // o.seite { b, h, mm, papier, unendlich?, raster? }, o.liste = Elemente, o.flaeche 'hell' | 'dunkel',
  // o.ausschnitt { x1, y1, x2, y2 } (Standard: das Blatt), o.massstab (Standard 2), o.hintergrund(ctx) = z. B. die PDF-Seite
  function malBild(cv, o) {
    const seite = o.seite, fl = o.flaeche || 'hell';
    const a = o.ausschnitt || { x1: 0, y1: 0, x2: seite.b, y2: seite.h };
    const w0 = Math.max(1, a.x2 - a.x1), h0 = Math.max(1, a.y2 - a.y1);
    // Nicht mehr als CANVAS_MAX Pixel (Safari auf dem iPad) und 12000 Pixel je Seite
    const m = Math.min(o.massstab || 2, 12000 / Math.max(w0, h0), Math.sqrt(CANVAS_MAX / (w0 * h0)));
    cv.width = Math.max(1, Math.round(w0 * m));
    cv.height = Math.max(1, Math.round(h0 * m));
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = seite.unendlich ? (seite.papierFarbe || PAPIER[fl]) : (fl === 'dunkel' ? '#0f1627' : '#f3f5f9');
    c.fillRect(0, 0, cv.width, cv.height);
    c.setTransform(m, 0, 0, m, -a.x1 * m, -a.y1 * m);
    if (seite.unendlich) malBrettRaster(c, seite.raster, a.x1, a.y1, a.x2, a.y2, fl, m);
    else {
      c.save();
      c.beginPath();
      c.rect(0, 0, seite.b, seite.h);
      c.clip();
      const gemalt = o.hintergrund ? o.hintergrund(c) : false;
      if (!gemalt) {
        c.fillStyle = seite.papierFarbe || PAPIER[fl];
        c.fillRect(0, 0, seite.b, seite.h);
        if (seite.papier) malVorlage(c, seite, 0, seite.h, fl, m);
      }
      c.restore();
    }
    malElemente(c, o.liste || [], seite, fl, fl);
    return m;
  }

  /* ---------- Die Leinwand ---------- */

  function Leinwand(host, opt) {
    const L = {};
    const hoererListe = {};
    const emit = (art, wert) => (hoererListe[art] || []).forEach(fn => fn(wert));
    L.on = (art, fn) => { (hoererListe[art] || (hoererListe[art] = [])).push(fn); };

    host.classList.add('leinwand');
    // Zwei Ebenen: "canvas" trägt das Blatt mit allem Geschriebenen und ist ringsum grösser als das Bild. Beim
    // Verschieben und Zoomen wird es nur per CSS bewegt (Grafikkarte) und erst bei Bedarf neu gemalt. "live" ist
    // durchsichtig darüber und trägt, was gerade entsteht: den Strich unter dem Stift, Auswahl, Lasso, Radierkreis.
    const canvas = document.createElement('canvas');
    canvas.className = 'lw-canvas';
    const live = document.createElement('canvas');
    live.className = 'lw-live';
    // "spitze" liegt über "live" und trägt nur das letzte Stück des Strichs bis genau unter den Stift (dazu die vom
    // Browser vorhergesagten Punkte). Es wird jedes Bild neu gemalt, damit die Linie nicht hinter dem Stift herläuft.
    const spitze = document.createElement('canvas');
    spitze.className = 'lw-live lw-spitze';
    const menue = document.createElement('div');
    menue.className = 'lw-menue';
    menue.hidden = true;
    const editor = document.createElement('textarea');
    editor.className = 'lw-notiz-editor';
    editor.hidden = true;
    editor.setAttribute('aria-label', 'Text der Haftnotiz');
    const textFeld = document.createElement('textarea');
    textFeld.className = 'lw-text-editor';
    textFeld.hidden = true;
    textFeld.setAttribute('aria-label', 'Text');
    textFeld.setAttribute('autocapitalize', 'sentences');
    textFeld.spellcheck = true;
    const hinweis = document.createElement('p');
    hinweis.className = 'lw-hinweis';
    hinweis.textContent = opt.hinweis || 'Stift schreibt · ein Finger verschiebt · zwei Finger zoomen · 0 zentriert';
    // Schieber rechts: unsichtbar, erscheint nur beim Scrollen und verschwindet gut eine Sekunde danach wieder; den Griff ziehen springt schnell durchs Dokument (siehe aktualisiereSchieber). Nur der Griff fängt Eingaben
    // ab, daneben geht alles an die Schreibfläche: wer mit dem Finger am rechten Rand wischt, scrollt ganz normal.
    const schieber = document.createElement('div');
    schieber.className = 'lw-schieber';
    schieber.hidden = true;
    schieber.innerHTML = '<div class="lw-schieber-griff" role="scrollbar" aria-orientation="vertical" aria-label="Durch das Dokument blättern"></div>';
    const griff = schieber.firstElementChild;
    // Bewegt sich die Ansicht von selbst (Öffnen an der gemerkten Stelle, Tab-Wechsel, Fenstergrösse), bleibt der Schieber unsichtbar
    let schieberStillBis = 0;
    const schieberStill = () => { schieberStillBis = performance.now() + 500; };
    host.append(canvas, live, spitze, menue, editor, textFeld, hinweis, schieber);
    const ctx = canvas.getContext('2d');
    const lctx = live.getContext('2d');
    const sctx = spitze.getContext('2d');

    const einst = opt.einst;
    let seiten = [];
    const ink = new Map();               // Seiten-Id -> { e: [...], x: { Elementkennung: gelöscht am } }
    const ansicht = { x: 0, y: 0, s: 1 };
    let b = 0, h = 0, dpr = 1;
    let hostRect = { left: 0, top: 0 };  // Lage der Fläche, nicht bei jedem Punkt neu erfragen (das erzwingt ein Layout)
    let rand = 0;                        // so viel ist "canvas" links und rechts grösser als das Bild (CSS-px)
    let randY = 0;                       // ... und oben und unten (mehr: gescrollt wird meist senkrecht)
    let basis = null;                    // Ansicht, mit der "canvas" zuletzt gemalt wurde
    let inhaltVoll = true;               // das Blatt muss ganz neu gemalt werden
    let schmutz = null;                  // nur dieser Bereich (Dokument-Koordinaten) muss neu gemalt werden
    let overlayNeu = true;
    const ol = { x: 0, y: 0, s: 1, leer: true };
    let schaerfeTimer = 0;
    let gesamtHoehe = 0;
    let aktion = null, lassoPunkte = null, radiererPunkt = null;
    let transformStand = '';             // zuletzt gesetzte CSS-Verschiebung von canvas
    let schiebeTest = null;              // für Tests: verschiebeBasis abschalten (false) zum Vergleich
    let bewegtZeit = 0;                  // wann sich die Ansicht zuletzt bewegt hat (Scrollen, Zoomen, Schwung)
    let spitzeRect = null;               // wo die Spitze des Strichs zuletzt gemalt wurde (Pixel von "spitze")
    let textEdit = null, textOffenSeit = 0, textHalten = 0, textFingerTipp = null;   // Text, der gerade geschrieben wird
    let tippen = null;                   // Finger tippen für Gesten: { start, max, bewegt, pos, lang, fertig }
    let vorherigesWerkzeug = 'stift';
    let notizFingerTipp = null;          // ein Finger liegt auf einer Haftnotiz: Tippen (ohne Wischen) schreibt Text
    let letztesSchreibwerkzeug = einst.werkzeug === 'marker' ? 'marker' : 'stift';
    let geplant = false, penZeit = 0;
    let diagProbe = null, diagGeplant = false;
    const auswahl = new Map();           // Element -> Seiten-Id
    const finger = new Map();
    const touchPos = new Map();          // letzte Position jedes Fingers (für den Wechsel Schreiben -> Geste)
    let geste = null;
    let verlauf = [], zukunft = [];
    let tx = null;
    let editiert = null;
    let aktuelleSeite = 0;
    let leertaste = false;
    const neuZuLaden = new Set();
    let aktiv = true;

    const inhalt = sid => { let v = ink.get(sid); if (!v) { v = { e: [] }; ink.set(sid, v); } return v; };
    const seiteMitId = sid => seiten.find(s => s.id === sid);

    /* ----- Aufbau ----- */

    function endlosHoehe(s) {
      let y = 0;
      for (const e of inhalt(s.id).e) { const g = grenzen(e); if (g.y2 > y) y = g.y2; }
      return Math.max(s.h, y + 400);
    }
    function layout() {
      let y = 0;
      for (const s of seiten) {
        s.x = -s.b / 2;
        s.y = y;
        s.hh = s.unendlich ? 1e5 : s.endlos ? endlosHoehe(s) : s.h;
        y += s.hh + LUECKE;
      }
      gesamtHoehe = Math.max(0, y - LUECKE);
    }

    L.setzeSeiten = function (liste, erstesMal) {
      schieberStill();
      seiten = liste.map(s => ({ ...s }));
      for (const s of seiten) if (!ink.has(s.id)) ink.set(s.id, normalisiere(opt.ladeInk(s.id)));
      for (const sid of [...ink.keys()]) if (!seiten.some(s => s.id === sid)) ink.delete(sid);
      for (const [el, sid] of auswahl) if (!ink.has(sid)) auswahl.delete(el);
      layout();
      if (erstesMal) { if (!b) groesse(); einpassen(); }
      plane();
    };
    // Seite aus der Ablage übernehmen (eigene Kopie) und fehlende Kennungen ergänzen (Daten älterer Versionen)
    function normalisiere(v) {
      let r;
      if (Array.isArray(v)) r = { e: klon(v) };
      else if (v && Array.isArray(v.e)) r = klon(v);
      else r = { e: [] };
      const gesehen = new Set();
      for (const el of r.e) {
        if (!el.id || gesehen.has(el.id)) el.id = kurzId();
        gesehen.add(el.id);
      }
      if (!r.x || typeof r.x !== 'object' || !Object.keys(r.x).length) delete r.x;
      return r;
    }

    /* ----- Koordinaten ----- */

    const zuDok = (sx, sy) => [(sx - ansicht.x) / ansicht.s, (sy - ansicht.y) / ansicht.s];
    const zuSchirm = (dx, dy) => [dx * ansicht.s + ansicht.x, dy * ansicht.s + ansicht.y];
    function seiteBeiY(dy) {
      if (!seiten.length) return null;
      for (let i = 0; i < seiten.length; i++) {
        const s = seiten[i];
        if (dy < s.y + s.hh + LUECKE / 2) return s;
      }
      return seiten[seiten.length - 1];
    }
    const lokal = (s, dx, dy) => [dx - s.x, dy - s.y];

    function lokalPunkt(e) {
      return [e.clientX - hostRect.left, e.clientY - hostRect.top];
    }
    const messeHost = () => { const r = host.getBoundingClientRect(); hostRect = { left: r.left, top: r.top }; };

    // Druck und Neigung des Stifts, angepasst an die eingestellte Druckkurve. Gespeichert werden sie in wenigen
    // Stufen; schon hier gerundet, damit man nach dem Laden genau das sieht, was man geschrieben hat.
    let letzterRoh = 0.5, rohProben = [];
    const stufe = (v, n) => Math.round(v * n) / n;
    function stiftWerte(e) {
      if (e.pointerType !== 'pen' || !einst.druck) return [0.5, 0];
      // Manche Treiber melden kurz 0 (Auf- und Absetzen), dann gilt der letzte Wert weiter
      if (e.pressure > 0) { letzterRoh = e.pressure; if (rohProben.length < 2000) rohProben.push(e.pressure); }
      const p = druckAbbildung(letzterRoh, einst);
      let n = 0;
      if (einst.neigung === true) {
        const ab = einst.neigungAb == null ? 30 : Number(einst.neigungAb);
        n = Math.max(0, Math.min(1, (neigungWinkel(e) - ab) / (80 - ab)));
      }
      return [stufe(p, DRUCK_STUFEN), stufe(n, NEIGUNG_STUFEN)];
    }
    // Nach einem Strich mit dem Stift: den gewohnten Schreibdruck (Median des Strichs) langsam nachführen, damit die
    // Kurve "Wie Apple Pencil" zum Stift passt. Gespeichert wird erst, wenn er sich merklich verschoben hat.
    function lerneDruck() {
      const proben = rohProben;
      rohProben = [];
      if (einst.druckModus === 'eigen' || !einst.druck || proben.length < 6) return;
      proben.sort((x, y) => x - y);
      const alt = druckTypisch(einst);
      const neu = Math.max(0.12, Math.min(0.75, alt + DRUCK_LERNEN * (proben[proben.length >> 1] - alt)));
      einst.druckTypisch = Math.round(neu * 10000) / 10000;
      if (Math.abs(neu - druckGespeichert) >= 0.01) {
        druckGespeichert = neu;
        opt.einstGeaendert && opt.einstGeaendert();
      }
    }
    let druckGespeichert = druckTypisch(einst);
    // filter: Glättung der Position (nur beim Schreiben, nicht beim ersten und letzten Punkt)
    function stiftPunkt(e, s, filter) {
      let [sx, sy] = lokalPunkt(e);
      if (filter) [sx, sy] = filter(sx, sy, e.timeStamp);
      const [dx, dy] = zuDok(sx, sy);
      const [druck, neigung] = stiftWerte(e);
      let x = dx - s.x, y = dy - s.y;
      // Begrenztes Blatt: am Rand festhalten statt darüber hinaus zu schreiben
      if (opt.begrenzt) {
        x = Math.max(0, Math.min(s.b, x));
        y = Math.max(0, s.endlos ? y : Math.min(s.h, y));
      }
      return neigung ? [r1(x), r1(y), druck, neigung] : [r1(x), r1(y), druck];
    }
    // Punkt i des Strichs aus den rohen Punkten (a.roh) festlegen: Lage aus den Nachbarn im Abstand von wenigen
    // Bildschirm-px (Gauss über die Weglänge a.weg, a.sigma in Einheiten), Druck und Neigung aus DRUCK_FENSTER Punkten
    // davor und danach. Anfang und Ende bleiben genau, wo der Stift war.
    function festerPunkt(a, i) {
      const roh = a.roh, n = roh.length, w = a.weg, q = roh[i];
      let x = q[0], y = q[1];
      if (a.sigma > 0 && i > 0 && i < n - 1) {
        const g = 1 / (2 * a.sigma * a.sigma), von = Math.max(0, i - a.fenster), bis = Math.min(n - 1, i + a.fenster);
        let sx = 0, sy = 0, sw = 0;
        for (let j = von; j <= bis; j++) { const d = w[j] - w[i], k = Math.exp(-d * d * g); sx += roh[j][0] * k; sy += roh[j][1] * k; sw += k; }
        x = sx / sw; y = sy / sw;
      }
      let sd = 0, sn = 0, sk = 0;
      for (let j = Math.max(0, i - DRUCK_FENSTER); j <= Math.min(n - 1, i + DRUCK_FENSTER); j++) {
        const k = Math.exp(-(j - i) * (j - i) / 4);
        sd += (roh[j][2] == null ? 0.5 : roh[j][2]) * k; sn += (roh[j][3] || 0) * k; sk += k;
      }
      let dr = sd / sk, nei = sn / sk;
      if (a.stil) { dr = stilDruck(a, i, dr); if (a.stil === 'kugel') nei = 0; }
      const d = stufe(dr, DRUCK_STUFEN), ne = stufe(nei, NEIGUNG_STUFEN);
      return ne ? [r1(x), r1(y), d, ne] : [r1(x), r1(y), d];
    }
    // Druck eines Punkts nach der Stiftart (siehe STIFTARTEN): Tempo aus den Zeiten der Punkte (mm je Sekunde auf dem
    // Glas, also unabhängig vom Zoom), Feder aus der Drehung des Stifts, Ansatz des Pinsels aus dem Weg seit dem Aufsetzen
    function stilDruck(a, i, dr) {
      if (a.stil === 'kugel') return 0.5;
      const pinsel = a.stil === 'pinsel';
      const roh = a.roh, n = roh.length, w = a.weg, z = a.zeit, zoom = a.zoom || 1;
      if (pinsel) dr = a.stiftDruck ? Math.min(1, 1.05 * Math.pow(dr, 1.6)) : 0.55;
      let k = 1;
      const i0 = Math.max(0, i - 3), i1 = Math.min(n - 1, i + 3), dt = z[i1] - z[i0];
      if (dt > 0) {
        const mmS = (w[i1] - w[i0]) * zoom / dt * 1000 / MM;
        k *= 1 - (pinsel ? (a.stiftDruck ? 0.35 : 0.6) : 0.2) * weich((mmS - (pinsel ? 25 : 45)) / (pinsel ? 230 : 260));
      }
      if (!pinsel && a.hatDreh && einst.federDrehung !== false && n > 1) {
        const u = roh[Math.max(0, i - 1)], v = roh[Math.min(n - 1, i + 1)];
        const feder = (45 + (a.dreh[i] || 0)) * Math.PI / 180;
        k *= 0.72 + 0.56 * Math.abs(Math.sin(Math.atan2(v[1] - u[1], v[0] - u[0]) - feder));
      }
      if (pinsel) k *= 0.3 + 0.7 * weich(w[i] * zoom / (2.2 * MM));
      if (k === 1) return dr;
      return Math.max(pinsel ? 0 : 0.03, Math.min(1, druckVonBreite(breiteVonDruck(dr) * k)));
    }
    // Pinselstift beim Abheben: die letzten gut 2 mm laufen spitz aus (mit echtem Druck weniger, der Stift wird beim
    // Abheben ohnehin leichter)
    function pinselAuslauf(a) {
      const p = a.strich.p, zoom = a.zoom || 1, lang = 2.4 * MM / zoom, lo = a.stiftDruck ? 0.55 : 0.22;
      let weg = 0;
      for (let i = p.length - 1; i >= 0 && weg < lang; i--) {
        if (i < p.length - 1) weg += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
        if (weg >= lang) break;
        p[i][2] = stufe(Math.max(0, Math.min(1, druckVonBreite(breiteVonDruck(p[i][2] == null ? 0.5 : p[i][2]) * (lo + (1 - lo) * weich(weg / lang))))), DRUCK_STUFEN);
      }
    }
    // Alle Punkte festlegen, deren Nachbarn schon da sind (ende: alle)
    function festige(a, ende) {
      if (!a.roh) return;
      const p = a.strich.p, bis = ende ? a.roh.length : a.roh.length - Math.max(a.fenster, DRUCK_FENSTER);
      for (let i = p.length; i < bis; i++) p.push(festerPunkt(a, i));
    }
    // Die noch nicht festen Punkte, so wie sie jetzt aussähen (für die Spitze und die Formerkennung)
    function offenePunkte(a) {
      if (!a.roh) return [];
      const raus = [];
      for (let i = a.strich.p.length; i < a.roh.length; i++) raus.push(festerPunkt(a, i));
      return raus;
    }
    function aufSeite(s, dx, dy) {
      const x = dx - s.x, y = dy - s.y;
      return x >= 0 && x <= s.b && y >= 0 && (s.endlos || y <= s.h);
    }
    // Elemente, die über den Blattrand ragen, zurück aufs Blatt schieben
    function aufsBlatt(el, s) {
      const g = grenzen(el);
      const H = s.endlos ? Infinity : s.h;
      let dx = 0, dy = 0;
      if (g.x2 - g.x1 <= s.b) { if (g.x1 < 0) dx = -g.x1; else if (g.x2 > s.b) dx = s.b - g.x2; }
      if (g.y2 - g.y1 <= H) { if (g.y1 < 0) dy = -g.y1; else if (g.y2 > H) dy = H - g.y2; }
      if (!dx && !dy) return;
      if (istKasten(el)) { el.x = r1(el.x + dx); el.y = r1(el.y + dy); }
      else el.p = el.p.map(q => punktMit(q, r1(q[0] + dx), r1(q[1] + dy)));
    }

    /* ----- Ansicht ----- */

    function groesse() {
      schieberStill();
      const r = host.getBoundingClientRect();
      // Ausgeblendet (z. B. ein Tab im Hintergrund): Ansicht behalten statt beim Zurückkommen neu einzupassen
      if (!r.width || !r.height) return;
      const vorher = b;
      b = r.width; h = r.height;
      hostRect = { left: r.left, top: r.top };
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      // Ringsum Reserve zum Verschieben ohne Neuzeichnen, aber nicht mehr Pixel, als die Grafikkarte sinnvoll trägt
      // Oben und unten viel Reserve: beim Scrollen mit dem Finger wird so nur etwa alle 1000 px neu gemalt statt alle
      // 300 px (jedes volle Neumalen ist auf dem iPad ein kleiner Ruck); seitlich reicht weniger
      rand = Math.round(Math.max(64, Math.min(200, Math.min(b, h) * 0.15)));
      randY = Math.round(Math.max(160, Math.min(1000, h * 0.9)));
      // Safari (iPad) malt eine Zeichenfläche über 16,7 Millionen Pixel gar nicht mehr: darunter bleiben, erst mit
      // weniger Reserve oben und unten, dann seitlich, zuletzt mit weniger Auflösung
      const pixel = () => (b + 2 * rand) * (h + 2 * randY) * dpr * dpr;
      while (randY > 160 && pixel() > CANVAS_MAX) randY = Math.max(160, Math.round(randY * 0.9));
      while (rand > 48 && pixel() > CANVAS_MAX) rand = Math.max(48, Math.round(rand * 0.85));
      while (dpr > 1 && pixel() > CANVAS_MAX) dpr = Math.max(1, dpr - 0.25);
      // Alle Ebenen genau auf dem Pixelraster des Bildschirms: der Rand ist eine ganze Zahl von Bildschirmpixeln, und jede
      // Ebene ist in CSS genau so gross wie ihre Pixel / dpr. Sonst lag "canvas" z. B. bei 150 % um einen halben Pixel
      // neben "live", und ein Strich sah nach dem Absetzen anders aus als beim Schreiben (test/strich.js).
      rand = Math.round(rand * dpr) / dpr;
      randY = Math.round(randY * dpr) / dpr;
      const lw0 = Math.round(b * dpr), lh0 = Math.round(h * dpr);
      canvas.width = lw0 + 2 * Math.round(rand * dpr);
      canvas.height = lh0 + 2 * Math.round(randY * dpr);
      canvas.style.width = canvas.width / dpr + 'px';
      canvas.style.height = canvas.height / dpr + 'px';
      canvas.style.left = -rand + 'px';
      canvas.style.top = -randY + 'px';
      for (const c of [live, spitze]) {
        c.width = lw0; c.height = lh0;
        c.style.width = lw0 / dpr + 'px';
        c.style.height = lh0 / dpr + 'px';
      }
      // Gleich einmal benutzen: sonst legt der Browser die Zeichenflächen erst beim ersten Strich an, und gerade der
      // erste Strich nach dem Öffnen hakt (test/leistung.js)
      // Dazu ein unsichtbarer Probestrich durch dieselben Funktionen wie beim Schreiben (übersetzt sie vorab)
      const probe = { w: 'stift', d: 1, p: [] };
      for (let i = 0; i < 40; i++) probe.p.push([i, (i % 7) * 0.5, 0.3 + (i % 5) / 10]);
      for (const c of [lctx, sctx]) { c.setTransform(1, 0, 0, 1, -1000, -1000); c.lineCap = c.lineJoin = 'round'; malAbschnitte(c, probe, 0, probe.p.length - 1); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 4, 4); }
      spitzeRect = null;
      basis = null; inhaltVoll = true; overlayNeu = true; ol.leer = true;
      if (!vorher && seiten.length) einpassen();
      else if (umschalt.bis > performance.now()) {
        // Gerade ins Vollbild oder wieder heraus: die Fenstergrösse kommt in mehreren Schritten, die Ansicht folgt
        if (umschalt.zurueck) setzeAnsichtIntern(umschalt.zurueck); else einpassen(true);
      } else if (vorher && seiten.length && Math.abs(b - vorher) > vorher * 0.15) {
        // Viel schmaler oder breiter auf einmal (zwei Dokumente nebeneinander, Teilung aufgehoben, iPad gedreht): die
        // Seite wieder passend einpassen, die Stelle im Dokument bleibt. Auf dem Whiteboard nur die Mitte halten.
        if (opt.unendlich) ansicht.x += (b - vorher) / 2; else einpassen(true);
      }
      frame();
    }

    // Vollbild: Seite füllt die Breite fast ganz (schmale Ränder, auch stärker vergrössert als sonst). Beim Verlassen
    // kommt die Ansicht von vorher zurück.
    let voll = false;
    const umschalt = { bis: 0, zurueck: null };
    let ansichtVorVoll = null;
    L.setzeVollbild = an => {
      an = !!an;
      if (an === voll) return;
      voll = an;
      if (an) { ansichtVorVoll = L.merkAnsicht(); umschalt.zurueck = null; }
      else { umschalt.zurueck = ansichtVorVoll; ansichtVorVoll = null; }
      umschalt.bis = performance.now() + 900;
      groesse();
      if (an) einpassen(true);
    };

    function breitesteSeite() { return seiten.reduce((m, s) => Math.max(m, s.b), 0) || 794; }
    // Unendliche Fläche (Whiteboard): alles Geschriebene ins Bild holen, bei leerer Fläche den Ursprung mittig
    function einpassenBrett() {
      const s = seiten[0];
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      if (s) for (const e of inhalt(s.id).e) { const g = grenzen(e); x1 = Math.min(x1, g.x1 + s.x); y1 = Math.min(y1, g.y1 + s.y); x2 = Math.max(x2, g.x2 + s.x); y2 = Math.max(y2, g.y2 + s.y); }
      if (x1 === Infinity) { ansicht.s = 1; ansicht.x = b / 2; ansicht.y = h / 2; }
      else {
        const rand = 48;
        ansicht.s = Math.max(ZOOM_MIN, Math.min(opt.maxEinpassen || 1.5, (b - 2 * rand) / Math.max(40, x2 - x1), (h - 2 * rand) / Math.max(40, y2 - y1)));
        ansicht.x = b / 2 - (x1 + x2) / 2 * ansicht.s;
        ansicht.y = h / 2 - (y1 + y2) / 2 * ansicht.s;
      }
      begrenze();
      planeAnsicht();
      emit('ansicht', ansicht.s);
    }
    function einpassen(obenBehalten) {
      if (!b) return;
      if (opt.unendlich) { einpassenBrett(); return; }
      const dyOben = zuDok(0, 0)[1];
      // Links und rechts bleibt Platz, um neben der Seite zu schreiben; im Vollbild nur ein schmaler Streifen
      const rand = voll ? Math.max(6, b * 0.008) : Math.max(RAND, b * (opt.randAnteil == null ? 0.09 : opt.randAnteil));
      ansicht.s = Math.max(ZOOM_MIN, Math.min(voll ? 4 : opt.maxEinpassen || 1.3, (b - 2 * rand) / breitesteSeite()));
      ansicht.x = b / 2;
      ansicht.y = obenBehalten ? -dyOben * ansicht.s : RAND - (seiten[0] ? seiten[0].y : 0) * ansicht.s;
      begrenze();
      planeAnsicht();
      emit('ansicht', ansicht.s);
    }
    L.einpassen = () => einpassen(true);
    L.ansicht = () => ({ ...ansicht, b, h });
    function setzeAnsichtIntern(a) {
      if (!a || !isFinite(a.s)) return;
      schieberStill();
      ansicht.s = a.s; ansicht.x = b / 2 + (a.dx || 0) * a.s; ansicht.y = -a.dy * a.s;
      begrenze(); planeAnsicht(); emit('ansicht', ansicht.s);
    }
    L.setzeAnsicht = setzeAnsichtIntern;
    L.merkAnsicht = () => ({ s: ansicht.s, dx: (ansicht.x - b / 2) / ansicht.s, dy: -ansicht.y / ansicht.s });
    // y: Stelle auf der Seite (Einheiten), die oben im Bild stehen soll, z. B. ein Abschnitt oder ein Suchtreffer
    L.springeZuSeite = (i, weich, y) => {
      const s = seiten[Math.max(0, Math.min(seiten.length - 1, i))];
      if (!s) return;
      const ziel = RAND - (s.y + Math.max(0, Math.min(s.hh || s.h, y || 0))) * ansicht.s;
      if (weich) { animiereY(ziel); return; }
      stoppeAnim();
      ansicht.y = ziel;
      begrenze(); planeAnsicht();
    };

    function begrenze() {
      ansicht.s = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, ansicht.s));
      if (!seiten.length || !h) return;
      if (opt.unendlich) {
        // Keine Grenzen, nur nicht so weit, dass die Zahlen ungenau werden
        const weit = 1e6 * ansicht.s;
        ansicht.x = Math.max(b / 2 - weit, Math.min(b / 2 + weit, ansicht.x));
        ansicht.y = Math.max(h / 2 - weit, Math.min(h / 2 + weit, ansicht.y));
        return;
      }
      const oben = seiten[0].y;
      const unten = gesamtHoehe + (opt.neueSeite ? LUECKE + NEUE_SEITE_H : 0);
      // Oben nicht weiter als bis 40 % hinunter, unten höchstens bis 60 % hinauf
      const maxY = h * 0.4 - oben * ansicht.s;
      const minY = h * 0.6 - unten * ansicht.s;
      ansicht.y = Math.min(maxY, Math.max(Math.min(minY, maxY), ansicht.y));
      if (opt.begrenzt) {
        // Begrenztes Blatt: nicht seitlich daneben schieben
        const w = breitesteSeite() * ansicht.s;
        if (w <= b - 2 * RAND) ansicht.x = b / 2;
        else ansicht.x = Math.min(RAND + w / 2, Math.max(b - RAND - w / 2, ansicht.x));
        return;
      }
      // Nach links und rechts frei, aber nie so weit, dass man sich völlig verliert
      const weit = 20000 * ansicht.s;
      ansicht.x = Math.max(b / 2 - weit, Math.min(b / 2 + weit, ansicht.x));
    }

    /* ----- Schieber rechts ----- */
    // Der Schieber steht für den Weg vom Anfang (erste Seite oben im Bild) bis zum Ende (letzte Seite unten im Bild).
    // Er erscheint, sobald sich die Ansicht senkrecht bewegt, und blendet sich nach gut einer Sekunde Ruhe wieder aus.
    const SCHIEBER_RAND = 6;
    let schieberTimer = 0, schieberZieht = null;
    function scrollBereich() {
      if (!seiten.length || !h || opt.unendlich) return null;
      const oben = seiten[0].y, unten = gesamtHoehe + (opt.neueSeite ? LUECKE + NEUE_SEITE_H : 0);
      const yOben = RAND - oben * ansicht.s, yUnten = h - RAND - unten * ansicht.s;
      if (yUnten >= yOben - 1) return null;   // alles passt ins Bild: kein Schieber
      return { yOben, yUnten, inhalt: (unten - oben) * ansicht.s + 2 * RAND };
    }
    const anteil = r => Math.max(0, Math.min(1, (r.yOben - ansicht.y) / (r.yOben - r.yUnten)));
    function aktualisiereSchieber(zeigen) {
      const r = scrollBereich();
      schieber.hidden = !r;
      if (!r) return;
      const spur = h - 2 * SCHIEBER_RAND;
      const gh = Math.max(44, Math.min(spur, spur * h / r.inhalt));
      const oben = SCHIEBER_RAND + anteil(r) * (spur - gh);
      griff.style.height = gh + 'px';
      griff.style.transform = `translateY(${oben}px)`;
      if (zeigen && performance.now() > schieberStillBis) zeigeSchieber();
    }
    function zeigeSchieber() {
      schieber.classList.add('da');
      clearTimeout(schieberTimer);
      if (!schieberZieht) schieberTimer = setTimeout(() => schieber.classList.remove('da'), 1100);
    }
    function schieberNach(p, weich) {
      const r = scrollBereich();
      if (!r) return;
      const ziel = r.yOben - Math.max(0, Math.min(1, p)) * (r.yOben - r.yUnten);
      if (weich) { animiereY(ziel); return; }
      stoppeAnim();
      ansicht.y = ziel;
      begrenze(); planeAnsicht();
    }
    griff.addEventListener('pointerdown', e => {
      const r = scrollBereich();
      if (!r) return;
      e.preventDefault(); e.stopPropagation();
      try { griff.setPointerCapture(e.pointerId); } catch (err) { /* ohne Festhalten */ }
      stoppeAnim();
      schieberZieht = { id: e.pointerId, y0: e.clientY, p0: anteil(r) };
      schieber.classList.add('zieht');
      zeigeSchieber();
    });
    griff.addEventListener('pointermove', e => {
      if (!schieberZieht || e.pointerId !== schieberZieht.id) return;
      const spur = h - 2 * SCHIEBER_RAND, gh = griff.offsetHeight;
      schieberNach(schieberZieht.p0 + (e.clientY - schieberZieht.y0) / Math.max(1, spur - gh));
    });
    const schieberEnde = e => {
      if (!schieberZieht || e.pointerId !== schieberZieht.id) return;
      schieberZieht = null;
      schieber.classList.remove('zieht');
      zeigeSchieber();
      emit('ansicht', ansicht.s);
    };
    griff.addEventListener('pointerup', schieberEnde);
    griff.addEventListener('pointercancel', schieberEnde);
    griff.addEventListener('lostpointercapture', schieberEnde);   // Loslassen verpasst: sonst bliebe er sichtbar

    function zoomeUm(px, py, faktor) {
      const s = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, ansicht.s * faktor));
      ansicht.x = px - (px - ansicht.x) * s / ansicht.s;
      ansicht.y = py - (py - ansicht.y) * s / ansicht.s;
      ansicht.s = s;
      planeAnsicht();
      emit('ansicht', ansicht.s);
    }
    L.zoome = faktor => zoomeUm(b / 2, h / 2, faktor);

    /* ----- Zeichnen ----- */

    // "canvas" ist mit der Ansicht "basis" gemalt; seine Pixel beginnen "rand" CSS-px links und "randY" oberhalb des Bildes
    const basisTransform = () => ctx.setTransform(dpr * basis.s, 0, 0, dpr * basis.s, dpr * (basis.x + rand), dpr * (basis.y + randY));
    const liveTransform = () => lctx.setTransform(dpr * ansicht.s, 0, 0, dpr * ansicht.s, dpr * ansicht.x, dpr * ansicht.y);

    function flaecheSeite(s) { return opt.flaeche ? opt.flaeche(s) : flaecheThema(); }

    function zeichneRaster(oben, unten, links, rechts) {
      ctx.fillStyle = thema.aussen;
      ctx.fillRect(links, oben, rechts - links, unten - oben);
      // Beim Herauszoomen gröberes Raster, damit es nicht zu einer Fläche verschwimmt
      let schritt = KARO;
      while (schritt * basis.s < 12) schritt *= 5;
      ctx.save();
      ctx.strokeStyle = thema.hell ? thema.karo : 'rgba(255, 255, 255, .11)';
      ctx.lineWidth = 1 / basis.s;
      ctx.beginPath();
      for (let x = Math.floor(links / schritt) * schritt; x <= rechts; x += schritt) { ctx.moveTo(x, oben); ctx.lineTo(x, unten); }
      for (let y = Math.floor(oben / schritt) * schritt; y <= unten; y += schritt) { ctx.moveTo(links, y); ctx.lineTo(rechts, y); }
      ctx.stroke();
      ctx.restore();
    }

    function zeichneSeite(s, oben, unten) {
      const fl = flaecheSeite(s);
      const H = s.hh;
      ctx.save();
      ctx.translate(s.x, s.y);
      const px = 1 / basis.s;
      // Schatten und Blatt
      ctx.fillStyle = 'rgba(0, 0, 0, .28)';
      ctx.fillRect(3 * px, 5 * px, s.b, H);
      let gemalt = false;
      if (s.art === 'pdf' && opt.hintergrund) gemalt = opt.hintergrund(ctx, s, basis.s * dpr);
      if (!gemalt) {
        ctx.fillStyle = s.papierFarbe || PAPIER[fl];
        ctx.fillRect(0, 0, s.b, H);
        if (s.art === 'papier') malVorlage(ctx, s, oben - s.y, Math.min(unten - s.y, H), fl, basis.s);
        // Whiteboard-Blatt: Kästchen von 20 Einheiten wie bisher
        if (s.art === 'blatt') malVorlage(ctx, { ...s, papier: 'karo', mm: s.b / (KARO / 5) }, oben - s.y, Math.min(unten - s.y, H), fl, basis.s);
      }
      ctx.strokeStyle = thema.linie;
      ctx.lineWidth = px;
      ctx.strokeRect(0, 0, s.b, H);
      ctx.restore();
    }

    /* ----- Neue Seite durch Ziehen über das Ende hinaus ----- */
    // Am Ende nach unten weiterwischen: sobald der Zug weit genug ist, entsteht die Seite sofort, mitten im Wischen,
    // ohne Loslassen und ohne Wartezeit. Je Wischen gibt es höchstens eine Seite.
    const ZUG_WEG = 60;        // so weit (Bildschirm-px nach dem Widerstand) muss gezogen werden
    const ZUG_WIDERSTAND = 0.6;
    const RAD_WEG = 300;       // Mausrad/Touchpad: so viel über das Ende hinaus
    const zug = { px: 0, erledigt: false };
    let knopfTipp = null;      // ein Finger liegt auf dem Feld "Neue Seite": Tippen legt sie an, Wischen verschiebt
    let radZug = 0, radZeit = 0, radAmEnde = false, radErledigt = false;
    function untereGrenze() {
      const oben = seiten[0].y, unten = gesamtHoehe + LUECKE + NEUE_SEITE_H;
      return Math.min(h * 0.6 - unten * ansicht.s, h * 0.4 - oben * ansicht.s);
    }
    const zugFortschritt = () => Math.min(1, zug.px / ZUG_WEG);
    function neueSeiteSofort() {
      zug.erledigt = true;
      zug.px = 0;
      if (opt.neueSeite) opt.neueSeite({ sofort: true });
      plane();
    }
    // Senkrecht verschieben; am unteren Ende wird daraus der Zug für eine neue Seite
    function schiebeY(d) {
      if (!opt.neueSeite || !seiten.length || !h) { ansicht.y += d; return; }
      const vorher = zug.px;
      if (zug.px > 0 && d > 0) {
        const w = Math.min(zug.px, d * ZUG_WIDERSTAND);
        zug.px -= w;
        d -= w / ZUG_WIDERSTAND;
      }
      ansicht.y += d;
      const minY = untereGrenze();
      if (ansicht.y < minY) {
        zug.px = Math.min(ZUG_WEG * 1.6, zug.px + (minY - ansicht.y) * ZUG_WIDERSTAND);
        ansicht.y = minY;
      }
      if (zug.px >= ZUG_WEG && !zug.erledigt) { neueSeiteSofort(); return; }
      if (zug.px > 0 || vorher > 0) plane();
    }
    // Mausrad und Touchpad: zählt nur, wenn das Wischen am Ende begonnen hat (ausrollendes Scrollen bis ans Ende
    // erzeugt keine Seite), und danach höchstens eine Seite, bis das Rad eine Weile ruht
    function radUeberzug(dy, amEnde) {
      if (!opt.neueSeite || !seiten.length || !h) return;
      const jetzt = performance.now();
      if (jetzt - radZeit > 400) { radZug = 0; radErledigt = false; radAmEnde = amEnde; }
      radZeit = jetzt;
      if (radErledigt || !radAmEnde) return;
      if (dy > 0 && ansicht.y <= untereGrenze() + 1) radZug += dy; else if (dy < 0) radZug = 0;
      if (radZug >= RAD_WEG) { radErledigt = true; radZug = 0; neueSeiteSofort(); }
    }
    function zugAbbrechen() { if (zug.px) { zug.px = 0; plane(); } }
    function zugEnde() { zug.erledigt = false; zugAbbrechen(); }

    // Weich zu einer Höhe scrollen (neue Seite per Knopf, Seite wählen); jede Berührung unterbricht es
    let animBild = 0;
    function stoppeAnim() { if (animBild) { cancelAnimationFrame(animBild); animBild = 0; } }
    function animiereY(ziel) {
      stoppeAnim();
      const von = ansicht.y, t0 = performance.now(), dauer = 260;
      const schritt = jetzt => {
        const t = Math.min(1, (jetzt - t0) / dauer);
        ansicht.y = von + (ziel - von) * (1 - Math.pow(1 - t, 3));
        begrenze();
        planeAnsicht();
        animBild = t < 1 ? requestAnimationFrame(schritt) : 0;
      };
      animBild = requestAnimationFrame(schritt);
    }

    function zeichneNeueSeite() {
      const s = seiten[seiten.length - 1];
      if (!s || !opt.neueSeite) return;
      const px = 1 / basis.s;
      const x = -s.b / 2, y = gesamtHoehe + LUECKE + zug.px * px;
      const f = zug.px ? zugFortschritt() : 0;
      ctx.save();
      if (f > 0) {
        // Füllt sich beim Ziehen und Halten
        ctx.save();
        rundesRechteck(ctx, x, y, s.b, NEUE_SEITE_H, 14);
        ctx.clip();
        ctx.fillStyle = thema.auswahl;
        ctx.globalAlpha = f >= 1 ? 0.35 : 0.18;
        ctx.fillRect(x, y, s.b * f, NEUE_SEITE_H);
        ctx.restore();
      }
      ctx.strokeStyle = f >= 1 ? thema.auswahl : thema.grau;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.5 * px;
      ctx.setLineDash([8 * px, 6 * px]);
      rundesRechteck(ctx, x, y, s.b, NEUE_SEITE_H, 14);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = f >= 1 ? thema.auswahl : thema.grau;
      ctx.font = '600 22px "Atkinson Hyperlegible", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = !zug.px ? '+  Neue Seite' : 'Weiter ziehen: neue Seite';
      ctx.fillText(text, 0, y + NEUE_SEITE_H / 2);
      ctx.restore();
    }

    function sichtbareSeiten(oben, unten) {
      return seiten.filter(s => s.unendlich || (s.y - 600 < unten && s.y + s.hh + 600 > oben));
    }

    // Farbe des Strichs, der gerade entsteht: auf einer Haftnotiz immer die helle Palette
    function strichFarbeLive(s, a) {
      const st = a.strich;
      return a.notiz ? farbeVon(st, 'hell') : farbeVon(st, flaecheFuer(st, s, inhalt(s.id).e, flaecheSeite(s), flaecheThema()));
    }

    // Was sich im Bild geändert hat, entscheidet, wie wenig gemalt werden muss:
    //   plane()          der Inhalt hat sich geändert: das Blatt wird ganz neu gemalt
    //   planeBereich(r)  nur ein Bereich des Blatts (Dokument-Koordinaten), z. B. beim Radieren
    //   planeAnsicht()   nur Verschieben oder Zoomen: "canvas" wird per CSS bewegt, gemalt wird nur bei Bedarf
    //   anfordern()      nur die Ebene darüber (Strich unter dem Stift, Auswahl, Lasso)
    function anfordern() {
      if (!geplant) { geplant = true; requestAnimationFrame(frame); }
    }
    function plane() { inhaltVoll = true; anfordern(); }
    function planeAnsicht() { anfordern(); }
    function planeBereich(r) {
      if (inhaltVoll) { anfordern(); return; }
      schmutz = schmutz
        ? { x1: Math.min(schmutz.x1, r.x1), y1: Math.min(schmutz.y1, r.y1), x2: Math.max(schmutz.x2, r.x2), y2: Math.max(schmutz.y2, r.y2) }
        : { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 };
      anfordern();
    }
    L.plane = plane;

    // Zeichnet Raster, Seiten und Elemente in den Ausschnitt r (Dokument-Koordinaten); "canvas" ist dafür vorbereitet
    function zeichneInhalt(r) {
      const { x1: links, y1: oben, x2: rechts, y2: unten } = r;
      const brett = seiten.length && seiten[0].unendlich ? seiten[0] : null;
      if (brett) {
        // Whiteboard: die ganze Fläche ist Papier, mit Raster nach Wahl
        const fl = flaecheSeite(brett);
        ctx.fillStyle = brett.papierFarbe || PAPIER[fl];
        ctx.fillRect(links, oben, rechts - links, unten - oben);
        malBrettRaster(ctx, opt.raster ? opt.raster() : 'punkte', links, oben, rechts, unten, fl, basis.s);
      } else if (opt.begrenzt) {
        // Rand ohne Raster: hier wird nicht geschrieben
        ctx.fillStyle = thema.aussen;
        ctx.fillRect(links, oben, rechts - links, unten - oben);
      } else zeichneRaster(oben, unten, links, rechts);
      const sichtbar = sichtbareSeiten(oben, unten);
      for (const s of sichtbar) if (!s.unendlich && s.y < unten && s.y + s.hh > oben) zeichneSeite(s, oben, unten);
      zeichneNeueSeite();
      const flAussen = flaecheThema();
      for (const s of sichtbar) {
        const liste = inhalt(s.id).e;
        if (!liste.length) continue;
        ctx.save();
        ctx.translate(s.x, s.y);
        malElemente(ctx, liste, s, flaecheSeite(s), flAussen, editiert ? editiert.n : textEdit ? textEdit.el : null, true,
          { x1: links - s.x, y1: oben - s.y, x2: rechts - s.x, y2: unten - s.y });
        ctx.restore();
      }
    }

    // Wie oft wurde gemalt (für Tests und die Kontrolle, dass beim Schreiben und Verschieben nicht alles neu gemalt wird)
    const zaehl = { bilder: 0, voll: 0, bereich: 0, nurVerschoben: 0, live: 0 };
    L.statistik = () => ({ ...zaehl });
    // Für Tests: die Ebene über dem Blatt ganz neu malen (Vergleich mit dem schrittweisen Zeichnen des Strichs)
    L.liveNeu = () => { overlayNeu = true; anfordern(); };

    function rendereBasis(behalten) {
      zaehl.voll++;
      if (!behalten || !basis) basis = { x: ansicht.x, y: ansicht.y, s: ansicht.s };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      basisTransform();
      zeichneInhalt({ x1: (-rand - basis.x) / basis.s, y1: (-randY - basis.y) / basis.s, x2: (b + rand - basis.x) / basis.s, y2: (h + randY - basis.y) / basis.s });
    }

    // Nur einen Bereich neu malen (Dokument-Koordinaten): löschen, Hintergrund und alles, was hineinragt.
    // Der Bereich wird auf ganze Pixel der Zeichenfläche gerundet: läge seine Kante mitten in einem Pixel, würde dieser
    // nur zum Teil gelöscht und zum Teil neu gemalt, bliebe halb durchsichtig, und um das Neugemalte stünde ein feiner
    // Rahmen (z. B. um ein Strichstück, das beim Radieren übrig bleibt).
    function rendereBereich(r) {
      if (Math.abs(ansicht.s - basis.s) > 1e-9) { rendereBasis(); return; }
      zaehl.bereich++;
      const k = dpr * basis.s, ox = dpr * (basis.x + rand), oy = dpr * (basis.y + randY);
      const X1 = Math.max(0, Math.floor(r.x1 * k + ox) - 2), Y1 = Math.max(0, Math.floor(r.y1 * k + oy) - 2);
      const X2 = Math.min(canvas.width, Math.ceil(r.x2 * k + ox) + 2), Y2 = Math.min(canvas.height, Math.ceil(r.y2 * k + oy) + 2);
      if (X2 <= X1 || Y2 <= Y1) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(X1, Y1, X2 - X1, Y2 - Y1);
      ctx.clip();
      ctx.clearRect(X1, Y1, X2 - X1, Y2 - Y1);
      basisTransform();
      zeichneInhalt({ x1: (X1 - ox) / k, y1: (Y1 - oy) / k, x2: (X2 - ox) / k, y2: (Y2 - oy) / k });
      ctx.restore();
    }

    // Verschiebt das Bild auf "canvas" um ganze Bildschirmpixel zur aktuellen Ansicht und malt nur die frei gewordenen Streifen
    // neu (rendereBereich). false: nichts zu tun oder zu weit (dann malt frame alles neu).
    function verschiebeBasis() {
      if (schiebeTest === false) return false;
      const dxD = Math.round((ansicht.x - basis.x) * dpr), dyD = Math.round((ansicht.y - basis.y) * dpr);
      const randXD = Math.round(rand * dpr), randYD = Math.round(randY * dpr);
      if (Math.abs(dxD) < randXD * 0.5 && Math.abs(dyD) < randYD * 0.25) return false;
      if (Math.abs(dxD) >= canvas.width * 0.6 || Math.abs(dyD) >= canvas.height * 0.6) return false;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(canvas, dxD, dyD);
      ctx.restore();
      basis = { x: basis.x + dxD / dpr, y: basis.y + dyD / dpr, s: basis.s };
      // frei gewordene Streifen in Dokument-Koordinaten
      const k = dpr * basis.s, ox = dpr * (basis.x + rand), oy = dpr * (basis.y + randY);
      const doc = (X, Y) => [(X - ox) / k, (Y - oy) / k];
      const streifen = [];
      if (dyD > 0) streifen.push([0, 0, canvas.width, dyD]); else if (dyD < 0) streifen.push([0, canvas.height + dyD, canvas.width, canvas.height]);
      if (dxD > 0) streifen.push([0, 0, dxD, canvas.height]); else if (dxD < 0) streifen.push([canvas.width + dxD, 0, canvas.width, canvas.height]);
      for (const [X1, Y1, X2, Y2] of streifen) {
        const [x1, y1] = doc(X1, Y1), [x2, y2] = doc(X2, Y2);
        rendereBereich({ x1, y1, x2, y2 });
      }
      zaehl.geschoben = (zaehl.geschoben || 0) + 1;
      return true;
    }
    L.schiebeTest = an => { schiebeTest = an; };
    // Für Tests: alles neu malen, aber genau an der Stelle, an der das Bild gerade liegt (Vergleich mit verschiebeBasis)
    L.neuAnDerStelle = () => { if (basis) rendereBasis(true); };

    // Wie "canvas" (CSS) verschoben und skaliert werden muss, damit es zur aktuellen Ansicht passt
    function abweichung() {
      const k = ansicht.s / basis.s;
      return { k, tx: ansicht.x - basis.x * k - rand * k + rand, ty: ansicht.y - basis.y * k - randY * k + randY };
    }
    function deckt() {
      const a = abweichung();
      const links = -rand + a.tx, oben = -randY + a.ty;
      return links <= 0.5 && oben <= 0.5 && links + (b + 2 * rand) * a.k >= b - 0.5 && oben + (h + 2 * randY) * a.k >= h - 0.5;
    }
    function wendeTransformAn() {
      const a = abweichung();
      const tx = a.k === 1 ? Math.round(a.tx * dpr) / dpr : a.tx, ty = a.k === 1 ? Math.round(a.ty * dpr) / dpr : a.ty;
      const t = a.k === 1 ? `translate(${tx}px, ${ty}px)` : `translate(${tx}px, ${ty}px) scale(${a.k})`;
      if (t !== transformStand) { canvas.style.transform = t; transformStand = t; }
      return a;
    }
    // Ist "canvas" gegenüber der Ansicht verschoben oder skaliert, kommt kurz nach der Bewegung ein scharfes Neuzeichnen
    function pruefeSchaerfe(a) {
      clearTimeout(schaerfeTimer);
      if (Math.abs(a.k - 1) < 0.002 && Math.abs(a.tx) < rand * 0.4 && Math.abs(a.ty) < randY * 0.4) return;
      const los = () => { if (aktion) { schaerfeTimer = setTimeout(los, 250); return; } plane(); };
      schaerfeTimer = setTimeout(los, Math.abs(a.k - 1) < 0.002 ? 220 : 130);
    }

    const letzteAnsicht = { x: 0, y: 0, s: 0 };
    const VOLL_ABSTAND = 90;
    let vollZeit = 0, vollDauer = 0, vollTimer = 0, zoomZeit = 0;
    const zoomtGerade = () => (geste && geste.art === 2) || performance.now() - zoomZeit < 160;
    function frame() {
      geplant = false;
      if (!b || !h) return;
      host.classList.toggle('mit-hand', einst.werkzeug === 'hand');
      aktualisiereCursor();
      begrenze();
      let voll = inhaltVoll || !basis;
      // Gescrollt (gleicher Zoom): das fertige Bild um die Strecke verschieben und nur den neu sichtbaren Streifen malen,
      // statt der ganzen Fläche. Schon nach einem Viertel der Reserve, damit die Streifen schmal bleiben.
      if (!voll && !schmutz && Math.abs(ansicht.s - basis.s) < 1e-9 && verschiebeBasis()) { /* erledigt */ }
      else if (!voll && !deckt()) {
        // Beim Herauszoomen reicht das gemalte Bild bald nicht mehr über die ganze Fläche. Früher wurde dann in JEDEM
        // Bild alles neu gemalt (eine volle Seite: jedes Bild ein Ruck). Jetzt höchstens alle VOLL_ABSTAND ms, solange
        // die Finger zoomen; dazwischen wird das vorhandene Bild nur verkleinert, am Rand steht kurz der Hintergrund.
        const seit = performance.now() - vollZeit, abstand = Math.max(VOLL_ABSTAND, vollDauer * 4);
        if (zoomtGerade() && basis && seit < abstand) { clearTimeout(vollTimer); vollTimer = setTimeout(anfordern, abstand - seit + 4); }
        else voll = true;
      }
      zaehl.bilder++;
      if (voll) { const t0 = performance.now(); rendereBasis(); vollZeit = performance.now(); vollDauer = vollZeit - t0; }
      else if (schmutz) rendereBereich(schmutz);
      else zaehl.nurVerschoben++;
      inhaltVoll = false; schmutz = null;
      // Ansicht verschoben oder gezoomt: z. B. für die Seitenanzeige, die nur beim Scrollen erscheint
      if (ansicht.x !== letzteAnsicht.x || ansicht.y !== letzteAnsicht.y || ansicht.s !== letzteAnsicht.s) {
        const erstes = letzteAnsicht.s === 0;
        const nurQuer = !erstes && ansicht.y === letzteAnsicht.y && ansicht.s === letzteAnsicht.s;
        letzteAnsicht.x = ansicht.x; letzteAnsicht.y = ansicht.y; letzteAnsicht.s = ansicht.s;
        if (!erstes) { bewegtZeit = performance.now(); emit('bewegt'); }
        aktualisiereSchieber(!erstes && !nurQuer);
      } else if (voll) aktualisiereSchieber(false);
      const a = wendeTransformAn();
      aktualisiereSeite(zuDok(0, 0)[1]);
      positioniereMenue();
      positioniereEditor();
      positioniereText();
      zeichneOverlay();
      pruefeSchaerfe(a);
      planeVorbau();
    }

    // In ruhigen Momenten die Pfade der Striche auf den Seiten rund um das Bild schon bauen (teileVon), in Häppchen von
    // wenigen Millisekunden: kommt eine Seite beim Scrollen ins Bild, muss sie nur noch gemalt werden.
    let vorbauTimer = 0;
    function planeVorbau() { if (!vorbauTimer) vorbauTimer = setTimeout(vorbau, 250); }
    function vorbau() {
      vorbauTimer = 0;
      if (!aktiv || !b || !seiten.length) return;
      if (aktion || finger.size || geste || L.inBewegung()) { planeVorbau(); return; }
      const oben = zuDok(0, 0)[1], unten = zuDok(0, h)[1], hoehe = unten - oben;
      const t0 = performance.now();
      for (const sd of sichtbareSeiten(oben - 2 * hoehe, unten + 2 * hoehe)) {
        for (const e of inhalt(sd.id).e) {
          if (istKasten(e) || !e.p || e.p.length < 2) continue;
          if (pfadSpeicher.has(e) && pfadSpeicher.get(e).p === e.p) continue;
          teileVon(e);
          // ... und den Text des Strichs für das Speichern und den Verlauf: sonst schriebe das erste Speichern nach dem
          // Öffnen die ganze Seite auf einmal
          elText(e);
          if (performance.now() - t0 > 4) { planeVorbau(); return; }
        }
      }
    }

    /* ----- Die Ebene darüber ----- */

    function olLeeren() {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, live.width, live.height);
      ol.leer = true;
      leereSpitze();
    }

    // Die Spitze: vom zuletzt auf "live" gemalten Punkt bis unter den Stift. Nur der Bereich, in dem sie zuletzt lag,
    // wird geleert (Bildschirm-px der Zeichenfläche).
    function leereSpitze() {
      if (!spitzeRect) return;
      const r = spitzeRect;
      spitzeRect = null;
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
    }
    // Vorschau beim Schweben (Apple Pencil über dem Glas, ohne es zu berühren): ein Punkt in Farbe und Breite des
    // Stifts zeigt, wo und wie breit der Strich ansetzt; beim Radierer ein Ring in seiner Grösse. Nur auf Geräten ohne
    // Mauszeiger (dort zeigt schon der Zeiger den Punkt, punktCursor). Liegt auf "spitze", geleert wird nur sein Bereich.
    const ohneZeiger = window.matchMedia ? matchMedia('(hover: none)') : null;
    const schwebeAn = () => einst.schwebeVorschau !== false && (einst.schwebeVorschau === 'immer' || !ohneZeiger || ohneZeiger.matches);
    let schwebe = null, schwebeTimer = 0;
    function setzeSchwebe(x, y) {
      schwebe = { x, y, t: performance.now() };
      clearTimeout(schwebeTimer);
      // Der Stift geht aus der Reichweite, ohne dass der Browser es meldet: nach kurzer Zeit verschwindet der Punkt
      schwebeTimer = setTimeout(schwebeWeg, 1500);
      anfordern();
    }
    function schwebeWeg() { clearTimeout(schwebeTimer); if (schwebe) { schwebe = null; anfordern(); } }
    // Wo der Stift zuletzt schwebte (für die Palette am Stift), höchstens ein paar Sekunden alt
    let schwebeOrt = null;
    function zeichneSchwebe() {
      if (!schwebe || aktion || finger.size || !schwebeAn()) return;
      const w = einst.werkzeug, [dx, dy] = zuDok(schwebe.x, schwebe.y), s = seiteBeiY(dy);
      const fl = s && aufSeite(s, dx, dy) ? flaecheSeite(s) : flaecheThema();
      let r = 0, farbe = '', alpha = 1, ring = false;
      if (w === 'stift') { r = breite({ w: 'stift', d: stiftDicke(einst) }, 0.5) * ansicht.s / 2; farbe = tintenFarbe(einst.farbe, fl); alpha = 0.6; }
      else if (w === 'marker') { const f = einst.markerFarbe || 'gelb'; r = breite({ w: 'marker', d: einst.markerDicke || einst.dicke }) * ansicht.s / 2; farbe = istHex(f) ? f : MARKER[f] || MARKER.gelb; alpha = 0.35; }
      else if (w === 'radierer') { r = radiererRadius(); farbe = thema.grau; ring = true; }
      else if (w === 'laser') { r = Math.max(5, laserDurchmesser() * 0.35); farbe = laserFarbe(); ring = true; }
      else return;
      r = Math.max(ring ? 3 : 1.2, r);
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sctx.beginPath();
      sctx.arc(schwebe.x, schwebe.y, r, 0, Math.PI * 2);
      if (ring) { sctx.globalAlpha = 0.9; sctx.lineWidth = 1.5; sctx.strokeStyle = farbe; sctx.stroke(); }
      else { sctx.globalAlpha = alpha; sctx.fillStyle = farbe; sctx.fill(); }
      sctx.globalAlpha = 1;
      const g = (r + 3) * dpr, x = schwebe.x * dpr, y = schwebe.y * dpr;
      spitzeRect = { x1: Math.max(0, Math.floor(x - g)), y1: Math.max(0, Math.floor(y - g)), x2: Math.min(spitze.width, Math.ceil(x + g)), y2: Math.min(spitze.height, Math.ceil(y + g)) };
    }
    function zeichneSpitze() {
      leereSpitze();
      const a = aktion;
      if (!a || a.art !== 'zeichnen' || a.fertig || a.formFertig || a.strich.w === 'marker') return;
      const s = seiteMitId(a.sid);
      if (!s) return;
      // Nur das Ende des Strichs: ab dem Punkt vor dem ersten Abschnitt, den "live" noch nicht hat (für dessen Richtung)
      const alle = a.strich.p, ab = Math.max(0, alle.length - 3);
      const p = ab ? alle.slice(ab) : alle, offen = offenePunkte(a);
      let extra = a.spitze || [];
      // Die Punkte ganz vorn kommen roh vom Stift: mit einer Stiftart bekommen sie die Breite des letzten Punkts davor,
      // sonst wäre die Spitze z. B. beim Kugelschreiber dicker oder dünner als die Linie
      if (a.stil && extra.length) { const v = (offen.length ? offen[offen.length - 1] : alle[alle.length - 1])[2]; extra = extra.map(q => [q[0], q[1], v]); }
      const q = offen.length || extra.length ? p.concat(offen, extra) : p;
      if (!q.length) return;
      const ox = s.x + (a.notiz ? a.notiz.x : 0), oy = s.y + (a.notiz ? a.notiz.y : 0);
      const k = dpr * ansicht.s, dx = dpr * ansicht.x, dy = dpr * ansicht.y;
      sctx.setTransform(k, 0, 0, k, dx, dy);
      sctx.translate(ox, oy);
      sctx.lineCap = sctx.lineJoin = 'round';
      sctx.strokeStyle = sctx.fillStyle = a.farbe != null ? a.farbe : (a.farbe = strichFarbeLive(s, a));
      const von = Math.max(0, p.length - 2);   // der erste Abschnitt, den "live" noch nicht hat
      let wMax = 0;
      if (q.length === 1) {
        const w = breite(a.strich, q[0][2], q[0][3]);
        wMax = w;
        sctx.beginPath();
        sctx.arc(q[0][0], q[0][1], w / 2, 0, Math.PI * 2);
        sctx.fill();
      } else {
        for (let i = Math.max(0, von - 1); i < q.length; i++) wMax = Math.max(wMax, breite(a.strich, q[i][2], q[i][3]));
        malAbschnitte(sctx, { ...a.strich, p: q }, von, q.length - 1);
      }
      // Bereich merken, damit das nächste Bild genau ihn leert
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (let i = Math.max(0, von - 1); i < q.length; i++) {
        const x = (q[i][0] + ox) * k + dx, y = (q[i][1] + oy) * k + dy;
        if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
      }
      const r = wMax * k / 2 + 3;
      spitzeRect = { x1: Math.max(0, Math.floor(x1 - r)), y1: Math.max(0, Math.floor(y1 - r)), x2: Math.min(spitze.width, Math.ceil(x2 + r)), y2: Math.min(spitze.height, Math.ceil(y2 + r)) };
    }

    /* ----- Laserpointer: leuchtender Punkt mit kurzer Spur, die nach etwa 1,4 s verblasst ----- */
    // Es wird nichts auf die Seite gezeichnet oder gespeichert: alles liegt nur auf der Ebene "live" und verschwindet von selbst.
    // Position und Grösse in Bildschirm-px (der Punkt bleibt beim Zoomen gleich gross, wie ein echter Laserpunkt).
    const laser = { punkte: [], da: false, x: 0, y: 0 };
    const laserFarbe = () => (istHex(einst.laserFarbe) ? einst.laserFarbe : LASER_STANDARD);
    const laserDurchmesser = () => { const v = Number(einst.laserGroesse); return v > 0 ? Math.min(60, v) : 15; };
    function laserPunkt(ev) {
      const [x, y] = lokalPunkt(ev), t = performance.now();
      const letzter = laser.punkte[laser.punkte.length - 1];
      laser.x = x; laser.y = y; laser.da = true;
      if (!letzter || Math.hypot(x - letzter.x, y - letzter.y) > 0.5) laser.punkte.push({ x, y, t });
      if (laser.punkte.length > 400) laser.punkte.splice(0, laser.punkte.length - 400);
      anfordern();
    }
    function laserWeg() { laser.da = false; anfordern(); }
    function laserLeeren() { laser.punkte.length = 0; laser.da = false; }
    const laserSichtbar = () => laser.da || laser.punkte.length > 0;
    function zeichneLaser() {
      const jetzt = performance.now(), p = laser.punkte;
      while (p.length && jetzt - p[0].t > LASER_NACHLEUCHTEN) p.shift();
      if (!laser.da && !p.length) return;
      const farbe = laserFarbe(), d = laserDurchmesser();
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.lineCap = lctx.lineJoin = 'round';
      lctx.strokeStyle = farbe;
      // Spur: je älter, desto dünner und blasser; erst ein breiter weicher Schein, darüber der Kern
      for (let i = 1; i < p.length; i++) {
        const alter = Math.min(1, (jetzt - p[i].t) / LASER_NACHLEUCHTEN), f = Math.pow(1 - alter, 1.5);
        lctx.beginPath(); lctx.moveTo(p[i - 1].x, p[i - 1].y); lctx.lineTo(p[i].x, p[i].y);
        lctx.globalAlpha = 0.28 * f; lctx.lineWidth = d * (0.5 + 0.7 * (1 - alter)); lctx.stroke();
        lctx.globalAlpha = 0.85 * f; lctx.lineWidth = Math.max(1, d * (0.2 + 0.35 * (1 - alter))); lctx.stroke();
      }
      // Der Punkt vorn: solange der Stift da ist voll, sonst mit der Spur verblassend
      const k = laser.da ? { x: laser.x, y: laser.y, f: 1 } : { x: p[p.length - 1].x, y: p[p.length - 1].y, f: Math.pow(1 - Math.min(1, (jetzt - p[p.length - 1].t) / LASER_NACHLEUCHTEN), 1.5) };
      if (k.f > 0.01) {
        const g = lctx.createRadialGradient(k.x, k.y, 0, k.x, k.y, d * 1.7);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, farbe); g.addColorStop(0.42, farbe); g.addColorStop(1, 'rgba(255,255,255,0)');
        lctx.globalAlpha = k.f * 0.45; lctx.fillStyle = g;
        lctx.beginPath(); lctx.arc(k.x, k.y, d * 1.7, 0, Math.PI * 2); lctx.fill();
        lctx.globalAlpha = k.f; lctx.fillStyle = farbe;
        lctx.beginPath(); lctx.arc(k.x, k.y, d / 2, 0, Math.PI * 2); lctx.fill();
        lctx.fillStyle = 'rgba(255,255,255,.9)';
        lctx.beginPath(); lctx.arc(k.x, k.y, d * 0.2, 0, Math.PI * 2); lctx.fill();
      }
      lctx.globalAlpha = 1;
      ol.leer = false;
      if (p.length) anfordern();   // die Spur verblasst Bild für Bild
    }

    // Mauszeiger: Punkt in der Stiftfarbe (aufgehellt) und in der Dicke des Strichs; nur wo es einen Zeiger gibt (Maus, Stift
    // über dem Bildschirm). Touch hat keinen Zeiger, dort ändert das nichts.
    const hatZeiger = window.matchMedia ? matchMedia('(any-hover: hover)') : null;
    let cursorStand = '';
    function aktualisiereCursor() {
      let c = '';
      // Beim Verschieben (Leertaste, mittlere Maustaste) gilt der Greifer, nicht der Punkt
      if ((!hatZeiger || hatZeiger.matches) && !leertaste && !host.classList.contains('schiebt')) {
        const w = einst.werkzeug, fl = flaecheThema();
        if (w === 'stift') c = punktCursor(breite({ w: 'stift', d: stiftDicke(einst) }, 0.5) * ansicht.s, tintenFarbe(einst.farbe, fl), 0.92);
        else if (w === 'marker') {
          const f = einst.markerFarbe || 'gelb';
          c = punktCursor(breite({ w: 'marker', d: einst.markerDicke || einst.dicke }) * ansicht.s, istHex(f) ? f : MARKER[f] || MARKER.gelb, 0.6);
        } else if (w === 'radierer') c = punktCursor(radiererRadius() * 2 * ansicht.s, '#ffffff', 1, true);
        else if (w === 'laser') c = punktCursor(Math.max(10, laserDurchmesser() * 0.7), laserFarbe(), 1, true);   // nur ein Ring: aus, bis man drückt
      }
      if (c !== cursorStand) { canvas.style.cursor = c; cursorStand = c; }
    }
    L.on('werkzeug', aktualisiereCursor);
    L.on('ansicht', aktualisiereCursor);
    if (hatZeiger && hatZeiger.addEventListener) hatZeiger.addEventListener('change', aktualisiereCursor);

    // Der Strich unter dem Stift: nur die neuen Abschnitte zeichnen. Abschnitt k ist fertig, sobald Punkt k + 2 da ist
    // (crStueck); das Stück danach bis unter den Stift malt die Spitze (beim Loslassen wird der ganze Strich übernommen).
    function zeichneLiveStrich() {
      const a = aktion, p = a.strich.p;
      // Der letzte Abschnitt hängt noch vom nächsten Punkt ab; eine fertige Form (Halten) ist sofort ganz da
      const bis = a.fertig ? p.length - 1 : p.length - 2;
      if (bis <= a.gemalt) return;
      const s = seiteMitId(a.sid);
      if (!s) return;
      if (a.farbe == null) a.farbe = strichFarbeLive(s, a);
      // Nur das Stück, das dazugekommen ist: der Strich wird Stück für Stück gebaut (LiveStrich), gelöscht und neu
      // gefüllt wird nur der Bereich, in dem sich etwas geändert hat, dort aber alles, was hineinragt, in einem Zug.
      // So sieht die Linie beim Schreiben genau so aus wie danach auf dem Blatt (stückweise übereinander gemalt
      // überlagerten sich an jeder Naht die weichen Kanten), und ein langer Strich kostet je Bild nicht mehr als ein kurzer.
      let lb = a.lb;
      if (!lb || lb.p !== p) lb = a.lb = LiveStrich(a.strich);
      if (a.gemalt === 0) lb.vonVorn();
      const k = lb.erweitere(bis);
      a.gemalt = bis;
      if (!k) return;
      const ox = s.x + (a.notiz ? a.notiz.x : 0), oy = s.y + (a.notiz ? a.notiz.y : 0);
      const f = dpr * ansicht.s, dx = dpr * ansicht.x + ox * f, dy = dpr * ansicht.y + oy * f;
      const X1 = Math.max(0, Math.floor(k.x1 * f + dx) - 3), Y1 = Math.max(0, Math.floor(k.y1 * f + dy) - 3);
      const X2 = Math.min(live.width, Math.ceil(k.x2 * f + dx) + 3), Y2 = Math.min(live.height, Math.ceil(k.y2 * f + dy) + 3);
      if (X2 <= X1 || Y2 <= Y1) return;
      lctx.save();
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(X1, Y1, X2 - X1, Y2 - Y1);
      lctx.beginPath();
      lctx.rect(X1, Y1, X2 - X1, Y2 - Y1);
      lctx.clip();
      liveTransform();
      lctx.translate(ox, oy);
      lctx.lineCap = lctx.lineJoin = 'round';
      // Füllfarbe UND Linienfarbe: Stiftstriche sind Flächen (fill), gleich breite eine Linie (stroke). Fehlte die
      // Füllfarbe, malte die Ebene schwarz, bis der fertige Strich in seiner Farbe auf das Blatt kam.
      lctx.strokeStyle = lctx.fillStyle = a.farbe;
      zaehl.live++;
      // Alles, was den gelöschten Bereich berührt (in Einheiten des Strichs, mit etwas Rand für die weichen Kanten)
      const pf = lb.pfad({ x1: (X1 - dx) / f - 1 / f, y1: (Y1 - dy) / f - 1 / f, x2: (X2 - dx) / f + 1 / f, y2: (Y2 - dy) / f + 1 / f });
      if (lb.linie()) { lctx.lineWidth = lb.breite(); lctx.stroke(pf); } else lctx.fill(pf);
      lctx.restore();
      ol.leer = false;
    }

    function zeichneOverlay() {
      const stand = ol.x !== ansicht.x || ol.y !== ansicht.y || ol.s !== ansicht.s;
      ol.x = ansicht.x; ol.y = ansicht.y; ol.s = ansicht.s;
      if (aktion && aktion.art === 'zeichnen') {
        if (overlayNeu || stand || aktion.gemalt == null) { olLeeren(); aktion.gemalt = 0; }
        // Textmarker leuchtet durch: Deckkraft der ganzen Ebene, damit sich überlappende Stücke nicht aufaddieren
        live.style.opacity = aktion.strich.w === 'marker' ? '0.35' : '';
        zeichneLiveStrich();
        zeichneSpitze();
      } else {
        leereSpitze();
        zeichneSchwebe();
        const etwas = auswahl.size || lassoPunkte || radiererPunkt, laserDa = laserSichtbar();
        if (!etwas && !laserDa && ol.leer) { overlayNeu = false; return; }
        live.style.opacity = '';
        olLeeren();
        if (etwas) { liveTransform(); zeichneAuswahl(lctx); ol.leer = false; }
        if (laserDa) zeichneLaser();
      }
      overlayNeu = false;
    }

    // Fertigen Strich auf das Blatt übernehmen, ohne alles neu zu malen
    function uebernehmeStrich(a) {
      if (inhaltVoll || !basis) { plane(); return; }   // das Blatt wird ohnehin neu gemalt, die Ebene darüber danach geleert
      const s = seiteMitId(a.sid);
      if (!s) { plane(); return; }
      ctx.save();
      basisTransform();
      ctx.translate(s.x + (a.notiz ? a.notiz.x : 0), s.y + (a.notiz ? a.notiz.y : 0));
      malStrich(ctx, a.strich, a.farbe != null ? a.farbe : strichFarbeLive(s, a));
      ctx.restore();
      olLeeren();
      live.style.opacity = '';
    }

    // Auswahlrahmen, Lasso und Radierkreis, in der Ansicht (Dokument-Koordinaten) auf Ebene c
    function zeichneAuswahl(c) {
      const px = 1 / ansicht.s;
      c.save();
      c.strokeStyle = thema.auswahl;
      c.lineWidth = 1.5 * px;
      c.setLineDash([6 * px, 4 * px]);
      const r = auswahlRahmen();
      if (r) {
        c.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
        c.setLineDash([]);
        c.fillStyle = thema.aussen;
        const g = GRIFF * px;
        for (const [x, y] of ecken(r)) {
          c.beginPath();
          c.arc(x, y, g / 2, 0, Math.PI * 2);
          c.fill();
          c.stroke();
        }
      }
      if (lassoPunkte && lassoPunkte.length > 1) {
        c.setLineDash([6 * px, 4 * px]);
        c.beginPath();
        c.moveTo(lassoPunkte[0][0], lassoPunkte[0][1]);
        for (const [x, y] of lassoPunkte) c.lineTo(x, y);
        c.closePath();
        c.stroke();
      }
      if (radiererPunkt) {
        c.setLineDash([]);
        c.strokeStyle = thema.grau;
        c.beginPath();
        c.arc(radiererPunkt[0], radiererPunkt[1], radiererRadius() * px, 0, Math.PI * 2);
        c.stroke();
      }
      c.restore();
    }

    function aktualisiereSeite(oben) {
      if (!seiten.length) return;
      const linie = oben + (h * 0.35) / ansicht.s;
      let i = 0;
      for (let k = 0; k < seiten.length; k++) if (seiten[k].y <= linie) i = k;
      if (i !== aktuelleSeite) { aktuelleSeite = i; emit('seite', i); }
    }
    L.aktuelleSeite = () => aktuelleSeite;
    // Wird gerade gescrollt, gezoomt oder schwingt die Fläche nach? Dann wartet z. B. das Rendern der PDF-Seiten,
    // damit es dem Bild nicht die Zeit wegnimmt (dokument.js)
    L.inBewegung = () => finger.size > 0 || !!geste || !!animBild || (aktion && aktion.art === 'schieben') || performance.now() - bewegtZeit < 180;
    // Nur eine Seite neu malen (z. B. wenn ihr PDF-Bild fertig ist), nicht die ganze Fläche
    L.planeSeite = nr => {
      const s = seiten.find(x => x.nr === nr);
      if (!s) { plane(); return; }
      planeBereich({ x1: s.x - 8, y1: s.y - 8, x2: s.x + s.b + 8, y2: s.y + s.hh + 8 });
    };
    /* ----- Auswahl ----- */

    function dokGrenzen(el, sid) {
      const s = seiteMitId(sid);
      const g = grenzen(el);
      return { x1: g.x1 + s.x, y1: g.y1 + s.y, x2: g.x2 + s.x, y2: g.y2 + s.y };
    }
    function auswahlRahmen() {
      if (!auswahl.size) return null;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const [el, sid] of auswahl) {
        if (!seiteMitId(sid)) continue;
        const g = dokGrenzen(el, sid);
        x1 = Math.min(x1, g.x1); y1 = Math.min(y1, g.y1); x2 = Math.max(x2, g.x2); y2 = Math.max(y2, g.y2);
      }
      if (x1 === Infinity) return null;
      const pad = 6 / ansicht.s;
      return { x1: x1 - pad, y1: y1 - pad, x2: x2 + pad, y2: y2 + pad };
    }
    const ecken = r => [[r.x1, r.y1], [r.x2, r.y1], [r.x2, r.y2], [r.x1, r.y2]];
    // toleranz: Abstand in Bildschirm-px, in dem eine Ecke getroffen ist (Finger brauchen mehr)
    function griffBei(dx, dy, toleranz) {
      const r = auswahlRahmen();
      if (!r) return -1;
      const tol = (toleranz || GRIFF + 8) / ansicht.s;
      return ecken(r).findIndex(([x, y]) => Math.abs(x - dx) <= tol && Math.abs(y - dy) <= tol);
    }
    function inAuswahl(dx, dy) {
      const r = auswahlRahmen();
      return r && dx >= r.x1 && dx <= r.x2 && dy >= r.y1 && dy <= r.y2;
    }
    L.auswahlLeeren = () => { if (auswahl.size) { auswahl.clear(); plane(); } };
    L.hatAuswahl = () => auswahl.size > 0;

    function innen(x, y, poly) {
      let drin = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) drin = !drin;
      }
      return drin;
    }

    /* ----- Verlauf ----- */

    function beginne() { tx = { vorher: new Map() }; }
    function beruehre(sid) { if (tx && !tx.vorher.has(sid)) tx.vorher.set(sid, schnapp(inhalt(sid))); }

    // Änderungen einer Seite kennzeichnen (für den Abgleich zwischen Geräten): jedes geänderte Element bekommt den
    // Zeitpunkt der Änderung, jedes gelöschte einen Grabstein. alt: Stand vorher (Schnappschuss), inh: Stand jetzt.
    function kennzeichne(alt, inh) {
      const jetzt = Date.now();
      const alteJson = texteVon(alt);
      const ids = new Set();
      for (const e of inh.e) {
        ids.add(e.id);
        const a = alteJson.get(e.id);
        if (a === undefined || a !== elText(e)) e.m = jetzt;
        if (inh.x && inh.x[e.id] !== undefined) delete inh.x[e.id];
      }
      for (const id of alteJson.keys()) if (!ids.has(id)) (inh.x || (inh.x = {}))[id] = jetzt;
      if (inh.x && !Object.keys(inh.x).length) delete inh.x;
    }

    function beende() {
      if (!tx) return;
      const t = tx;
      tx = null;
      const eintrag = { vorher: new Map(), nachher: new Map() };
      for (const [sid, vor] of t.vorher) {
        const inh = inhalt(sid);
        if (!gleicherSchnapp(schnapp(inh), vor)) {
          kennzeichne(vor, inh);
          eintrag.vorher.set(sid, vor);
          eintrag.nachher.set(sid, schnapp(inh));
        }
      }
      if (!eintrag.nachher.size) return;
      merkeSchritt(eintrag);
      for (const sid of eintrag.nachher.keys()) speichere(sid);
      if (seiten.some(s => s.endlos)) aktualisiereLayout();
    }
    function merkeSchritt(eintrag) {
      verlauf.push(eintrag);
      if (verlauf.length > 80) verlauf.shift();
      zukunft = [];
      emit('verlauf');
    }
    // Bei endlosen Blättern (Whiteboard) wächst die Seite mit dem Geschriebenen
    function aktualisiereLayout() {
      const vorher = gesamtHoehe;
      layout();
      if (gesamtHoehe !== vorher) plane();
    }

    // Automatisch speichern: jede Änderung (Strich, Radieren, Verschieben, Rückgängig/Wiederholen, Form) landet nach einem
    // kurzen Moment auf der Platte. Die kleine Wartezeit fasst nur Änderungen zusammen, die direkt aufeinander folgen
    // (z. B. beim Radieren über mehrere Striche); spätestens nach einer Sekunde wird gespeichert.
    const SICHERN_WARTE = 400, SICHERN_MAX = 1000;
    const zuSichern = new Set();
    let sichernTimer = 0, sichernSeit = 0;
    function speichere(sid) {
      zuSichern.add(sid);
      if (!sichernSeit) sichernSeit = Date.now();
      clearTimeout(sichernTimer);
      sichernTimer = setTimeout(sichernLauf, Math.max(0, Math.min(SICHERN_WARTE, SICHERN_MAX - (Date.now() - sichernSeit))));
    }
    // Das Speichern kopiert die ganze Seite; während ein Strich, eine Geste oder ein Verschieben läuft, wird es kurz verschoben,
    // damit es nicht ruckelt (höchstens vier Sekunden, dann gilt "nichts darf verloren gehen" mehr)
    // Auch solange der Stift gerade erst abgehoben hat oder über dem Blatt schwebt (penZeit): wer weiterschreibt, setzt sonst
    // genau dann den nächsten Strich an, wenn eine volle Seite kopiert wird (test/leistung.js). Beim Wechsel aus der App,
    // beim Schliessen und vor dem Neuladen wird sofort gesichert (sichernBeiAbschied, L.sichern).
    function sichernLauf() {
      const stiftNah = performance.now() - penZeit < 400;
      if ((aktion || geste || finger.size || stiftNah) && Date.now() - sichernSeit < 4000) { sichernTimer = setTimeout(sichernLauf, 150); return; }
      sichernJetzt();
    }
    function sichernJetzt() {
      clearTimeout(sichernTimer);
      sichernTimer = 0; sichernSeit = 0;
      const grenze = Date.now() - 180 * 864e5;
      for (const sid of [...zuSichern]) {
        zuSichern.delete(sid);
        if (!ink.has(sid)) continue;
        const inh = inhalt(sid);
        // Alte Grabsteine räumen sich selbst auf
        if (inh.x) { for (const id of Object.keys(inh.x)) if (inh.x[id] < grenze) delete inh.x[id]; if (!Object.keys(inh.x).length) delete inh.x; }
        opt.speichereInk(sid, inh);
      }
      // Gleich an die Ablage weitergeben, nicht erst nach deren eigener Wartezeit
      if (window.Daten && Daten.flush) Daten.flush();
    }
    L.sichern = sichernJetzt;
    L.ungesichert = () => zuSichern.size > 0;

    function stelleHer(stand) {
      for (const [sid, sn] of stand) {
        if (!seiteMitId(sid)) continue;
        const jetzt = inhalt(sid), neu = ausSchnapp(sn, jetzt);
        kennzeichne(schnapp(jetzt), neu);
        ink.set(sid, neu);
        speichere(sid);
      }
      auswahl.clear();
      layout();
      plane();
      emit('verlauf');
    }

    // Einzelne Elemente hinzufügen oder entfernen (Rückgängig und Wiederholen für einen Strich), ohne die Seite zu kopieren
    function entferneElement(sid, el, notiz) {
      const inh = inhalt(sid), jetzt = Date.now();
      if (notiz) {
        const i = notiz.e ? notiz.e.indexOf(el) : -1;
        if (i >= 0) { notiz.e.splice(i, 1); if (!notiz.e.length) delete notiz.e; notiz.m = jetzt; }
      } else {
        const i = inh.e.indexOf(el);
        if (i >= 0) inh.e.splice(i, 1);
        (inh.x || (inh.x = {}))[el.id] = jetzt;
      }
      auswahl.delete(el);
    }
    function fuegeElementEin(sid, el, notiz) {
      const inh = inhalt(sid);
      el.m = Date.now();
      if (notiz) { (notiz.e || (notiz.e = [])).push(el); notiz.m = el.m; }
      else { inh.e.push(el); if (inh.x) { delete inh.x[el.id]; if (!Object.keys(inh.x).length) delete inh.x; } }
    }
    // Einen Strich durch einen anderen ersetzen (Linie/Form <-> gezeichnetes Original), an derselben Stelle der Liste
    function ersetzeElement(sid, von, nach, notiz) {
      const inh = inhalt(sid);
      const liste = notiz ? notiz.e || [] : inh.e;
      const i = liste.indexOf(von);
      if (i < 0) return false;
      liste[i] = nach;
      nach.m = Date.now();
      if (notiz) notiz.m = nach.m;
      auswahl.delete(von);
      return true;
    }
    function schrittAusfuehren(e, rueckwaerts) {
      if (e.ersetze) {
        const { sid, alt, neu, notiz } = e.ersetze;
        if (ersetzeElement(sid, rueckwaerts ? neu : alt, rueckwaerts ? alt : neu, notiz)) speichere(sid);
        aktualisiereLayout();
        plane();
        emit('verlauf');
      } else if (e.strich) {
        const { sid, el, notiz } = e.strich;
        if (rueckwaerts) entferneElement(sid, el, notiz); else fuegeElementEin(sid, el, notiz);
        speichere(sid);
        aktualisiereLayout();
        plane();
        emit('verlauf');
      } else stelleHer(rueckwaerts ? e.vorher : e.nachher);
    }
    L.rueckgaengig = () => { const e = verlauf.pop(); if (!e) return; zukunft.push(e); schrittAusfuehren(e, true); };
    L.wiederholen = () => { const e = zukunft.pop(); if (!e) return; verlauf.push(e); schrittAusfuehren(e, false); };
    L.kannRueckgaengig = () => verlauf.length > 0;
    L.kannWiederholen = () => zukunft.length > 0;

    // Von aussen geändert (anderes Gerät, anderes Fenster, Cloud). Der eigene Stand wird nie einfach überschrieben,
    // sondern mit dem anderen zusammengeführt: so geht nichts verloren, auch wenn gerade geschrieben wurde.
    L.neuLaden = sid => {
      if (!seiteMitId(sid)) return;
      if (aktion || editiert || textEdit) { neuZuLaden.add(sid); return; }
      const extern = normalisiere(opt.ladeInk(sid));
      let ergebnis = extern, nachSichern = false;
      if (window.LHFormat) {
        const eigen = inhalt(sid);
        ergebnis = normalisiere(LHFormat.fuehreSeiteZusammen(eigen, extern));
        if (LHFormat.gleicheSeite(ergebnis, eigen)) return;           // nichts Neues
        nachSichern = !LHFormat.gleicheSeite(ergebnis, extern);       // wir haben mehr als die Datei
      }
      ink.set(sid, ergebnis);
      for (const [el, s] of auswahl) if (s === sid) auswahl.delete(el);
      verlauf = []; zukunft = [];
      layout();
      plane();
      emit('verlauf');
      if (nachSichern) speichere(sid);
    };
    function ausstehendeLaden() {
      if (!neuZuLaden.size) return;
      const liste = [...neuZuLaden];
      neuZuLaden.clear();
      liste.forEach(L.neuLaden);
    }

    /* ----- Werkzeuge ----- */

    L.einst = einst;
    L.setzeWerkzeug = w => {
      if (w !== 'text' && textEdit) { textOffenSeit = textHalten = 0; beendeText(); }
      if (w === 'stift' || w === 'marker') letztesSchreibwerkzeug = w;
      if (w !== einst.werkzeug) vorherigesWerkzeug = einst.werkzeug;
      einst.werkzeug = w;
      if (w !== 'laser') laserLeeren();
      if (w !== 'lasso') auswahl.clear();
      opt.einstGeaendert && opt.einstGeaendert();
      emit('werkzeug', w);
      plane();
    };
    L.setzeStiftArt = art => { einst.stiftArt = STIFTARTEN[art] ? art : 'fueller'; opt.einstGeaendert && opt.einstGeaendert(); emit('werkzeug', einst.werkzeug); };
    const keinSchreibwerkzeug = () => ['radierer', 'lasso', 'notiz', 'hand', 'laser', 'text'].includes(einst.werkzeug);
    L.setzeFarbe = f => {
      einst.farbe = f;
      if (!aendereAuswahl(el => { if (!istKasten(el) || istText(el)) el.f = f; })) {
        if (keinSchreibwerkzeug() || einst.werkzeug === 'marker') einst.werkzeug = 'stift';
      }
      opt.einstGeaendert && opt.einstGeaendert();
      emit('werkzeug', einst.werkzeug);
    };
    // Farbe des Laserpunkts (#rrggbb); wählt gleich den Laserpointer
    L.setzeLaserFarbe = f => {
      if (!istHex(f)) return;
      einst.laserFarbe = f.toLowerCase();
      einst.werkzeug = 'laser';
      auswahl.clear();
      opt.einstGeaendert && opt.einstGeaendert();
      emit('werkzeug', einst.werkzeug);
      plane();
    };
    L.setzeMarkerFarbe = f => {
      einst.markerFarbe = f;
      einst.werkzeug = 'marker';
      auswahl.clear();
      opt.einstGeaendert && opt.einstGeaendert();
      emit('werkzeug', einst.werkzeug);
      plane();
    };
    // Nur die ausgewählten Striche umfärben (Menü an der Auswahl), ohne die Stiftfarbe zu ändern
    L.faerbeAuswahl = f => { aendereAuswahl(el => { if (!istKasten(el) || istText(el)) el.f = f; }); };
    L.setzeFinger = an => { einst.finger = !!an; opt.einstGeaendert && opt.einstGeaendert(); emit('werkzeug', einst.werkzeug); };
    // Dicke per Schieberegler, getrennt für Stift, Textmarker und Radierer.
    // anwenden: erst beim Loslassen des Reglers auch die ausgewählten Striche ändern (ein Schritt im Verlauf)
    // Der Regler ändert immer auch den Wert der gerade gewählten Grösse (Klein, Mittel, Gross) dieses Werkzeugs.
    const GROESSE = { stift: 'dicke', marker: 'markerDicke', radierer: 'radierGroesse', laser: 'laserGroesse', text: 'textGroesse' };
    const groesseArt = () => (['marker', 'radierer', 'laser', 'text'].includes(einst.werkzeug) ? einst.werkzeug : 'stift');
    // Der Regler und die drei Grössen gelten in Millimetern (Stift und Marker: Strichbreite, Radierer: Durchmesser);
    // die Schreibfläche rechnet in Einheiten um (einheit). So ist 1 mm auf jedem Gerät und bei jedem Zoom gleich dick.
    L.setzeDicke = (mm, anwenden) => {
      const w = einst.werkzeug, art = groesseArt();
      einst[GROESSE[art]] = einheit(art, mm);
      if (w === 'radierer' && einst.radiermodus === 'strich') einst.radiermodus = 'bereich';
      if (einst.presets && einst.preset) einst.presets[art][einst.preset[art]] = mm;
      if (anwenden && w === 'lasso') aendereAuswahl(el => { if (!istKasten(el)) el.d = einheit('stift', mm); });
      if (art === 'text') wendeTextGroesseAn(anwenden);
      opt.einstGeaendert && opt.einstGeaendert();
      emit('werkzeug', einst.werkzeug);
    };
    // Eine der drei Grössen wählen: der Regler springt auf ihren Wert
    L.waehleGroesse = name => {
      const art = groesseArt();
      if (!einst.presets || !einst.presets[art] || einst.presets[art][name] == null) return;
      einst.preset[art] = name;
      einst[GROESSE[art]] = einheit(art, einst.presets[art][name]);
      if (einst.werkzeug === 'radierer' && einst.radiermodus === 'strich') einst.radiermodus = 'bereich';
      if (art === 'text') wendeTextGroesseAn(true);
      opt.einstGeaendert && opt.einstGeaendert();
      emit('werkzeug', einst.werkzeug);
    };
    L.setzeNotizFarbe = f => {
      einst.notizFarbe = f;
      aendereAuswahl(el => { if (istNotiz(el)) el.f = f; });
      opt.einstGeaendert && opt.einstGeaendert();
      emit('werkzeug', einst.werkzeug);
    };
    L.setzeRadiermodus = m => { einst.radiermodus = m; opt.einstGeaendert && opt.einstGeaendert(); emit('werkzeug', einst.werkzeug); };

    function aendereAuswahl(fn) {
      if (!auswahl.size) return false;
      beginne();
      for (const [el, sid] of auswahl) { beruehre(sid); fn(el); }
      beende();
      plane();
      return true;
    }

    const istRadiertaste = e => (e.buttons & 32) !== 0 || e.button === 5;
    const istSeitentaste = e => (e.buttons & 2) !== 0 || e.button === 2;
    function werkzeugFuer(e) {
      if (e.pointerType === 'pen') {
        const belegung = istRadiertaste(e) ? einst.radier : istSeitentaste(e) ? einst.seite : null;
        if (belegung && belegung !== 'aus') return belegung;
      }
      return einst.werkzeug;
    }
    function tastenTest(e) {
      const name = istRadiertaste(e) ? 'Radiertaste oder Stiftende' : istSeitentaste(e) ? 'Seitentaste' : 'Stiftspitze ohne Taste';
      emit('stifttaste', `Erkannt: ${name} · Druck: ${Math.round(e.pressure * 100)} %`);
    }

    /* ----- Radieren ----- */

    const radiererRadius = () => (einst.radiermodus === 'strich' ? RADIERER : einst.radierGroesse || RADIER_BEREICH[einst.radiermodus] || 14);
    function abstand(px, py, a, c) {
      const dx = c[0] - a[0], dy = c[1] - a[1], l = dx * dx + dy * dy;
      const t = l ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l)) : 0;
      return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
    }
    function trifft(s, x, y, radius) {
      const r = radius + breite(s, 1) / 2;
      if (s.p.length === 1) return Math.hypot(x - s.p[0][0], y - s.p[0][1]) <= r;
      for (let i = 1; i < s.p.length; i++) if (abstand(x, y, s.p[i - 1], s.p[i]) <= r) return true;
      return false;
    }
    function verdichte(p, schritt) {
      const neu = [p[0]];
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1], c = p[i];
        const n = Math.floor(Math.hypot(c[0] - a[0], c[1] - a[1]) / schritt);
        for (let k = 1; k < n; k++) {
          const t = k / n;
          const pt = [r1(a[0] + (c[0] - a[0]) * t), r1(a[1] + (c[1] - a[1]) * t), stufe(a[2] + (c[2] - a[2]) * t, DRUCK_STUFEN)];
          const nn = stufe((a[3] || 0) + ((c[3] || 0) - (a[3] || 0)) * t, NEIGUNG_STUFEN);
          if (nn) pt.push(nn);
          neu.push(pt);
        }
        neu.push(c);
      }
      return neu;
    }
    // Radiert in einer Liste von Strichen; gibt die neue Liste zurück oder null, wenn nichts getroffen wurde
    // betroffen: sammelt die Striche, die sich geändert haben (so lässt sich nur ihr Bereich neu malen)
    function radiereListe(liste, x, y, r, betroffen) {
      let geaendert = false;
      const neu = [];
      for (const el of liste) {
        if (istKasten(el)) { neu.push(el); continue; }
        // Erst der Umriss: die allermeisten Striche liegen weit weg vom Radierer
        const g = umriss(el);
        if (x < g.x1 - r || x > g.x2 + r || y < g.y1 - r || y > g.y2 + r || !trifft(el, x, y, r)) { neu.push(el); continue; }
        if (einst.radiermodus === 'strich') { geaendert = true; betroffen.push(el); continue; }
        // Nur die Tinte im Kreis entfernen; ein Strich kann dabei zerfallen
        const teile = [];
        let teil = [], entfernt = false;
        for (const q of verdichte(el.p, Math.max(0.5, r / 3))) {
          if (Math.hypot(q[0] - x, q[1] - y) <= r + breite(el, q[2], q[3]) / 2) { entfernt = true; if (teil.length) teile.push(teil); teil = []; }
          else teil.push(q);
        }
        if (teil.length) teile.push(teil);
        if (!entfernt) { neu.push(el); continue; }
        geaendert = true;
        betroffen.push(el);
        for (const t of teile) if (t.length > 1) { const stueck = { ...el, id: kurzId(), p: t }; radierStuecke.add(stueck); neu.push(stueck); }
      }
      return geaendert ? neu : null;
    }
    function radiere(dx, dy) {
      radiererPunkt = [dx, dy];
      const r = radiererRadius() / ansicht.s;
      let bereich = null;
      const merke = (s, g) => {
        const x1 = g.x1 + s.x, y1 = g.y1 + s.y, x2 = g.x2 + s.x, y2 = g.y2 + s.y;
        bereich = bereich ? { x1: Math.min(bereich.x1, x1), y1: Math.min(bereich.y1, y1), x2: Math.max(bereich.x2, x2), y2: Math.max(bereich.y2, y2) } : { x1, y1, x2, y2 };
      };
      for (const s of seiten) {
        if (!s.unendlich && (dy < s.y - 400 || dy > s.y + s.hh + 400)) continue;
        const [x, y] = lokal(s, dx, dy);
        const betroffen = [];
        // Auf einer Haftnotiz nur deren Zeichnung radieren, nicht das, was darunter liegt
        const t = notizBei(dx, dy);
        if (t && t.sid === s.id) {
          const n = t.n;
          if (!n.zu && n.e && n.e.length) {
            const neu = radiereListe(n.e, x - n.x, y - n.y, r, betroffen);
            if (neu) { beruehre(s.id); if (neu.length) n.e = neu; else delete n.e; merke(s, umriss(n)); }
          }
          continue;
        }
        const neu = radiereListe(inhalt(s.id).e, x, y, r, betroffen);
        if (neu) { beruehre(s.id); inhalt(s.id).e = neu; for (const el of betroffen) merke(s, umriss(el)); }
      }
      // Nur dort neu malen, wo etwas verschwunden ist; der Radierkreis liegt auf der Ebene darüber
      if (bereich) planeBereich(bereich);
      anfordern();
    }

    /* ----- Haftnotizen ----- */

    function notizBei(dx, dy) {
      for (let k = seiten.length - 1; k >= 0; k--) {
        const s = seiten[k];
        const [x, y] = lokal(s, dx, dy);
        const liste = inhalt(s.id).e;
        for (let i = liste.length - 1; i >= 0; i--) {
          const n = liste[i];
          if (!istNotiz(n)) continue;
          const g = sicht(n);
          if (x >= n.x && x <= n.x + g.b && y >= n.y && y <= n.y + g.h) return { n, sid: s.id };
        }
      }
      return null;
    }
    // Welcher Teil einer Haftnotiz liegt unter dem Punkt: Knöpfe, Kopfleiste, Ecke oder Fläche
    function notizTeilBei(dx, dy) {
      const t = notizBei(dx, dy);
      if (!t) return null;
      const s = seiteMitId(t.sid), n = t.n;
      const lx = dx - s.x - n.x, ly = dy - s.y - n.y;
      const { b, h } = sicht(n);
      // Zugeklappt: das ganze Quadrat ist "Kopf" (tippen klappt auf, ziehen verschiebt)
      if (n.zu) return { ...t, was: 'kopf' };
      if (ly <= NOTIZ_KOPF) return { ...t, was: lx >= b - 25 ? 'mehr' : lx >= b - 49 ? 'zu' : 'kopf' };
      if (!n.zu && lx >= b - NOTIZ_ECKE && ly >= h - NOTIZ_ECKE) return { ...t, was: 'groesse' };
      return { ...t, was: 'flaeche' };
    }
    function aendereNotiz(n, sid, fn) {
      beginne();
      beruehre(sid);
      fn(n);
      beende();
      plane();
    }
    function bearbeiteNotiz(n, sid) {
      if (editiert) beendeEditor();
      beginne();
      beruehre(sid);
      delete n.zu;
      editiert = { n, sid };
      editor.value = n.t || '';
      editor.style.background = 'transparent';
      editor.hidden = false;
      positioniereEditor();
      editor.focus();
      plane();
    }
    function positioniereEditor() {
      if (!editiert) return;
      const s = seiteMitId(editiert.sid);
      if (!s) { beendeEditor(); return; }
      const n = editiert.n;
      // Nur die Fläche unter der Kopfleiste; Zeichnungen bleiben sichtbar, weil das Feld durchsichtig ist
      const [x, y] = zuSchirm(s.x + n.x, s.y + n.y + NOTIZ_KOPF);
      const gr = (n.gr || 18) * ansicht.s;
      Object.assign(editor.style, {
        left: x + 'px', top: y + 'px', width: n.b * ansicht.s + 'px', height: Math.max(0, n.h - NOTIZ_KOPF) * ansicht.s + 'px',
        fontSize: gr + 'px', lineHeight: '1.3', padding: `${gr * 0.3}px ${gr * 0.7}px ${gr * 0.5}px`
      });
    }
    function beendeEditor() {
      if (!editiert) return;
      editiert.n.t = editor.value.replace(/\s+$/, '');
      editiert = null;
      editor.hidden = true;
      beende();
      plane();
      ausstehendeLaden();
    }
    editor.addEventListener('input', () => { if (editiert) editiert.n.t = editor.value; });
    editor.addEventListener('blur', beendeEditor);
    editor.addEventListener('keydown', e => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); editor.blur(); }
      e.stopPropagation();
    });
    editor.addEventListener('pointerdown', e => e.stopPropagation());

    // Menü hinter den drei Punkten einer Haftnotiz: wann sie erstellt wurde, Farbe, Zuklappen, Löschen
    let notizMenue = null;
    function schliesseNotizMenue() {
      if (!notizMenue) return;
      notizMenue.remove();
      notizMenue = null;
      document.removeEventListener('pointerdown', ausserhalbNotizMenue, true);
    }
    function ausserhalbNotizMenue(e) { if (notizMenue && !notizMenue.contains(e.target)) schliesseNotizMenue(); }
    function zeigeNotizMenue(n, sid) {
      schliesseNotizMenue();
      const s = seiteMitId(sid);
      const erstellt = n.erstellt
        ? new Date(n.erstellt).toLocaleString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'unbekannt (vor dieser Funktion angelegt)';
      const el = document.createElement('div');
      el.className = 'kontext lw-notiz-kontext';
      el.setAttribute('role', 'menu');
      el.innerHTML = `
        <div class="kontext-titel">Haftnotiz</div>
        <p class="kontext-info">Erstellt: ${erstellt.replace(/[&<>]/g, '')}</p>
        <button type="button" data-n="zu">${n.zu ? 'Aufklappen' : 'Zuklappen'}</button>
        <button type="button" data-n="text">Text schreiben</button>
        <div class="kontext-farben" role="group" aria-label="Farbe">${Object.entries(NOTIZFARBEN).map(([f, c]) =>
          `<button type="button" data-nf="${f}" aria-label="${NOTIZNAMEN[f]}" aria-pressed="${(n.f || 'gelb') === f}" style="--farbe: ${c}"></button>`).join('')}</div>
        <button type="button" data-n="dup">Duplizieren</button>
        <button type="button" data-n="weg" class="gefahr">Löschen</button>`;
      document.body.appendChild(el);
      messeHost();
      const cr = hostRect;
      const [ax, ay] = zuSchirm(s.x + n.x + sicht(n).b, s.y + n.y + NOTIZ_KOPF);
      const mb = el.offsetWidth, mh = el.offsetHeight;
      el.style.left = Math.max(8, Math.min(cr.left + ax - mb, window.innerWidth - mb - 8)) + 'px';
      el.style.top = (cr.top + ay + mh + 8 > window.innerHeight ? Math.max(8, cr.top + ay - NOTIZ_KOPF * ansicht.s - mh - 4) : cr.top + ay + 4) + 'px';
      notizMenue = el;
      setTimeout(() => document.addEventListener('pointerdown', ausserhalbNotizMenue, true));
      el.addEventListener('keydown', e => { if (e.key === 'Escape') schliesseNotizMenue(); e.stopPropagation(); });
      el.addEventListener('click', e => {
        const k = e.target.closest('button');
        if (!k) return;
        schliesseNotizMenue();
        if (!inhalt(sid).e.includes(n)) return;
        if (k.dataset.nf) aendereNotiz(n, sid, x => { x.f = k.dataset.nf; });
        else if (k.dataset.n === 'zu') aendereNotiz(n, sid, x => { if (x.zu) delete x.zu; else x.zu = true; });
        else if (k.dataset.n === 'text') bearbeiteNotiz(n, sid);
        else if (k.dataset.n === 'dup' || k.dataset.n === 'weg') {
          auswahl.clear();
          auswahl.set(n, sid);
          if (k.dataset.n === 'dup') dupliziereAuswahl(); else loescheAuswahl();
        }
      });
      const erster = el.querySelector('button');
      if (erster) erster.focus({ preventScroll: true });
    }

    /* ----- Bilder einfügen ----- */

    function bildBei(dx, dy) {
      for (let k = seiten.length - 1; k >= 0; k--) {
        const s = seiten[k];
        const [x, y] = lokal(s, dx, dy);
        const liste = inhalt(s.id).e;
        for (let i = liste.length - 1; i >= 0; i--) {
          const el = liste[i];
          if (istBild(el) && x >= el.x && x <= el.x + el.b && y >= el.y && y <= el.y + el.h) return { el, sid: s.id };
        }
      }
      return null;
    }
    const meldung = text => { if (window.UI && UI.meldung) UI.meldung(text); };

    /* ----- Text ----- */

    // Tippen mit dem Text-Werkzeug: auf einen Text = ihn bearbeiten, sonst ein neuer Text an dieser Stelle. Bearbeitet wird
    // in einem Eingabefeld genau über dem Text (gleiche Schrift, Grösse und Farbe), die Schreibfläche lässt ihn solange aus.
    function textBei(dx, dy) {
      for (let k = seiten.length - 1; k >= 0; k--) {
        const s = seiten[k];
        const [x, y] = lokal(s, dx, dy);
        const liste = inhalt(s.id).e;
        for (let i = liste.length - 1; i >= 0; i--) {
          const el = liste[i];
          if (!istText(el)) continue;
          const g = umriss(el);
          if (x >= g.x1 && x <= g.x2 && y >= g.y1 && y <= g.y2) return { el, sid: s.id };
        }
      }
      return null;
    }
    const textFarbeVon = (el, sid) => {
      const s = seiteMitId(sid);
      return farbeVon(el, s ? flaecheFuer(el, s, inhalt(sid).e, flaecheSeite(s), flaecheThema()) : flaecheThema());
    };
    function textTippBei(dx, dy) {
      const t = textBei(dx, dy);
      if (t) { bearbeiteText(t.el, t.sid); return; }
      const s = seiteBeiY(dy);
      if (!s || (opt.begrenzt && !aufSeite(s, dx, dy))) return;
      const [x, y] = lokal(s, dx, dy);
      const gr = r1(einst.textGroesse || TEXT_STANDARD);
      // Zeilen dürfen bis kurz vor den rechten Blattrand gehen (daneben und auf dem Whiteboard bis 600 Einheiten)
      const aufBlatt = !s.unendlich && x >= 0 && x < s.b;
      const b = Math.max(gr * 3, Math.min(600, aufBlatt ? s.b - x - 20 : 600));
      const el = { typ: 'text', id: kurzId(), x: r1(x), y: r1(y - gr * TEXT_ZEILE / 2), b: r1(b), t: '', gr, f: einst.textFarbe || 'tinte', erstellt: Date.now() };
      if (opt.begrenzt) el.y = r1(Math.max(0, Math.min(s.endlos ? el.y : s.h - gr * TEXT_ZEILE, el.y)));
      beginne();
      beruehre(s.id);
      inhalt(s.id).e.push(el);
      bearbeiteText(el, s.id, true);
    }
    function bearbeiteText(el, sid, begonnen) {
      if (editiert) beendeEditor();
      if (textEdit) beendeText();
      if (!begonnen) { beginne(); beruehre(sid); }
      auswahl.clear();
      textEdit = { el, sid };
      textOffenSeit = performance.now();
      textFeld.value = el.t || '';
      textFeld.hidden = false;
      positioniereText();
      try { textFeld.focus({ preventScroll: true }); } catch (e) { textFeld.focus(); }
      const ende = textFeld.value.length;
      try { textFeld.setSelectionRange(ende, ende); } catch (e) { /* ohne Cursor ans Ende */ }
      emit('text', true);
      plane();
    }
    function positioniereText() {
      if (!textEdit) return;
      const { el, sid } = textEdit, s = seiteMitId(sid);
      if (!s) { beendeText(); return; }
      const L = textLayout(el), gr = el.gr || TEXT_STANDARD, k = ansicht.s;
      const [x, y] = zuSchirm(s.x + el.x, s.y + el.y);
      // Schon umgebrochen: genau so breit wie erlaubt (dann bricht auch das Feld dort um), sonst etwas Platz für den Cursor
      const breite = L.umgebrochen ? (el.b || 600) : L.b + gr * 0.6;
      const farbe = textFarbeVon(el, sid);
      const stand = [x, y, breite * k, L.h * k, gr * k, farbe].join('|');
      if (stand === textFeld.dataset.stand) return;
      textFeld.dataset.stand = stand;
      Object.assign(textFeld.style, {
        left: x + 'px', top: y + 'px', width: breite * k + 'px', height: Math.max(gr * TEXT_ZEILE, L.h) * k + 'px',
        fontSize: gr * k + 'px', color: farbe, caretColor: farbe
      });
    }
    function beendeText() {
      if (!textEdit) return;
      const { el, sid } = textEdit;
      textEdit = null;
      el.t = textFeld.value.replace(/\s+$/, '');
      textFeld.hidden = true;
      textFeld.value = '';
      textFeld.dataset.stand = '';
      // Leer geblieben: der Text verschwindet wieder (ein neuer hinterlässt dann auch keinen Schritt im Verlauf)
      if (!el.t) { const liste = inhalt(sid).e, i = liste.indexOf(el); if (i >= 0) liste.splice(i, 1); }
      beende();
      emit('text', false);
      plane();
      ausstehendeLaden();
    }
    // Ein Wechsel in die Werkzeugleiste (Farbe, Grösse) beendet das Schreiben nicht
    L.halteTextFokus = () => { textHalten = performance.now(); };
    L.textBearbeitung = () => !!textEdit;
    textFeld.addEventListener('input', () => {
      if (!textEdit) return;
      textEdit.el.t = textFeld.value;
      textEdit.el.m = Date.now();
      positioniereText();
    });
    textFeld.addEventListener('blur', () => {
      setTimeout(() => {
        if (!textEdit || document.activeElement === textFeld) return;
        const jetzt = performance.now();
        // Gleich nach dem Öffnen (iPad: Maus-Ereignisse nach dem Tippen) oder beim Griff in die Werkzeugleiste: weiter schreiben
        if (jetzt - textOffenSeit < 350 || jetzt - textHalten < 700) { try { textFeld.focus({ preventScroll: true }); } catch (e) { /* weiter ohne Fokus */ } return; }
        beendeText();
      }, 0);
    });
    textFeld.addEventListener('keydown', e => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); textOffenSeit = textHalten = 0; textFeld.blur(); beendeText(); }
      e.stopPropagation();
    });
    textFeld.addEventListener('pointerdown', e => e.stopPropagation());
    L.setzeTextFarbe = f => {
      einst.textFarbe = f;
      if (textEdit) { textEdit.el.f = f; positioniereText(); plane(); }
      else aendereAuswahl(el => { if (istText(el)) el.f = f; });
      if (einst.werkzeug !== 'text' && !auswahl.size && !textEdit) einst.werkzeug = 'text';
      opt.einstGeaendert && opt.einstGeaendert();
      emit('werkzeug', einst.werkzeug);
    };
    // Schriftgrösse des Textes, der gerade bearbeitet wird, oder der ausgewählten Texte
    function wendeTextGroesseAn(anwenden) {
      const gr = r1(einst.textGroesse || TEXT_STANDARD);
      if (textEdit) { textEdit.el.gr = gr; positioniereText(); plane(); return; }
      if (anwenden && auswahl.size) aendereAuswahl(el => { if (istText(el)) el.gr = gr; });
    }

    // Bild (Datei oder Zwischenablage) einfügen; wo = Punkt in Dokument-Koordinaten (Mitte des Bildes), sonst die Mitte
    // des Bildausschnitts. Es kommt in natürlicher Grösse, höchstens aber so gross, dass es gut ins Bild und aufs Blatt
    // passt, und ist danach ausgewählt: an den Ecken ziehen ändert die Grösse, in der Mitte ziehen verschiebt es.
    async function fuegeBildEin(blob, wo) {
      if (!blob) return false;
      let bild;
      try { bild = await bereiteBildVor(blob); } catch (e) { meldung(e.message || 'Das Bild konnte nicht eingefügt werden.'); return false; }
      if (!seiten.length || !b) return false;
      await bilderBereit([{ typ: 'bild', src: bild.src }]);
      const [dx, dy] = wo || zuDok(b / 2, h / 2);
      const s = seiteBeiY(dy);
      if (!s) return false;
      let bb = bild.w, hh = bild.h;
      const maxB = Math.min(0.8 * b / ansicht.s, s.unendlich ? Infinity : s.b * 0.9);
      const maxH = Math.min(0.8 * h / ansicht.s, s.unendlich || s.endlos ? Infinity : s.h * 0.9);
      const k = Math.min(1, maxB / bb, maxH / hh);
      bb *= k; hh *= k;
      const [x, y] = lokal(s, dx, dy);
      const el = { typ: 'bild', id: kurzId(), x: r1(x - bb / 2), y: r1(y - hh / 2), b: r1(bb), h: r1(hh), src: bild.src, erstellt: Date.now() };
      // Auf dem Blatt eines Notizbuchs bleiben; ein Skript darf auch daneben
      if (opt.begrenzt || (!s.unendlich && !wo)) aufsBlatt(el, s);
      if (editiert) beendeEditor();
      beginne();
      beruehre(s.id);
      inhalt(s.id).e.push(el);
      beende();
      auswahl.clear();
      auswahl.set(el, s.id);
      if (einst.werkzeug === 'laser' || einst.werkzeug === 'radierer') L.setzeWerkzeug('lasso');
      plane();
      return true;
    }
    L.fuegeBildEin = (blob, wo) => fuegeBildEin(blob, wo);
    // Bild aus einem Einfügen-Ereignis (Strg+V); true, wenn eines dabei war
    L.fuegeEinAus = daten => {
      const datei = [...((daten && daten.items) || [])].find(i => i.kind === 'file' && /^image\//.test(i.type));
      if (!datei) return false;
      fuegeBildEin(datei.getAsFile());
      return true;
    };
    async function bildAusAblageEinfuegen(wo) {
      let blob;
      try { blob = await bildAusZwischenablage(); } catch (e) { meldung(e.message); return; }
      if (!blob) { meldung('In der Zwischenablage ist kein Bild.'); return; }
      fuegeBildEin(blob, wo);
    }
    async function bildAusDateiEinfuegen(wo) {
      const datei = await waehleBildDatei();
      if (datei) fuegeBildEin(datei, wo);
    }
    // wo: Stelle in Dokument-Koordinaten (aus dem Menü an einer Stelle), sonst die Mitte des Bildes
    L.bildAusDatei = wo => bildAusDateiEinfuegen(wo);
    L.bildAusAblage = wo => bildAusAblageEinfuegen(wo);
    async function kopiereBild(el) {
      if (!el) return;
      try {
        const blob = await bildAlsPng(el);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        meldung('Bild kopiert');
      } catch (e) { meldung('Das Bild konnte nicht kopiert werden.'); }
    }

    // Menü "Bild einfügen" an einer Stelle (langes Drücken mit dem Finger, Rechtsklick). Nutzt denselben Platz wie das
    // Menü einer Haftnotiz (es ist immer nur eines offen, ein Tippen daneben schliesst es).
    function zeigeEinfuegeMenue(sx, sy, maus) {
      schliesseNotizMenue();
      messeHost();
      const wo = zuDok(sx, sy);
      const s = seiteBeiY(wo[1]);
      if (!s) return;
      if (opt.begrenzt && !aufSeite(s, wo[0], wo[1])) { const m = zuDok(b / 2, h / 2); wo[0] = m[0]; wo[1] = m[1]; }
      const mitZeiger = maus || !hatZeiger || hatZeiger.matches;
      // Das Dokument zeigt ein ganzes Menü für die Seite (Einfügen, Drehen, Seiten, Rückgängig …), siehe dokument.js
      if (opt.kontextMenue) { opt.kontextMenue({ x: hostRect.left + sx, y: hostRect.top + sy, nr: seiten.indexOf(s), wo, maus: mitZeiger }); return; }
      const el = document.createElement('div');
      el.className = 'kontext lw-notiz-kontext';
      el.setAttribute('role', 'menu');
      el.innerHTML = `
        <div class="kontext-titel">Bild einfügen</div>
        <button type="button" data-b="datei">${mitZeiger ? 'Bild vom Computer …' : 'Bild aus Fotos oder Dateien …'}</button>
        <button type="button" data-b="ablage">Bild aus der Zwischenablage</button>`;
      document.body.appendChild(el);
      const mb = el.offsetWidth, mh = el.offsetHeight;
      const cx = hostRect.left + sx, cy = hostRect.top + sy;
      el.style.left = Math.max(8, Math.min(cx - mb / 2, window.innerWidth - mb - 8)) + 'px';
      el.style.top = Math.max(8, cy - mh - 16 >= 8 ? cy - mh - 16 : Math.min(cy + 16, window.innerHeight - mh - 8)) + 'px';
      notizMenue = el;
      setTimeout(() => document.addEventListener('pointerdown', ausserhalbNotizMenue, true));
      el.addEventListener('keydown', e => { if (e.key === 'Escape') schliesseNotizMenue(); e.stopPropagation(); });
      el.addEventListener('click', e => {
        const k = e.target.closest('button');
        if (!k) return;
        schliesseNotizMenue();
        // Beides muss direkt aus dem Tippen heraus starten (Dateiauswahl und Zwischenablage brauchen eine Nutzeraktion)
        if (k.dataset.b === 'datei') bildAusDateiEinfuegen(wo);
        else if (k.dataset.b === 'ablage') bildAusAblageEinfuegen(wo);
      });
      if (mitZeiger) { const erster = el.querySelector('button'); if (erster) erster.focus({ preventScroll: true }); }
    }
    // Langes Drücken oder Rechtsklick: auf einem Bild wählt es aus (Grösse ändern, verschieben), sonst das Menü
    L.kontextBei = (sx, sy) => { messeHost(); zeigeEinfuegeMenue(sx, sy); };
    function kontextBei(sx, sy, maus) {
      const [dx, dy] = zuDok(sx, sy);
      const t = bildBei(dx, dy);
      if (t && !notizBei(dx, dy)) { auswahl.clear(); auswahl.set(t.el, t.sid); plane(); return; }
      zeigeEinfuegeMenue(sx, sy, maus);
    }

    // Finger lange ruhig auf der Fläche (wenn er nicht schreibt): wie ein Rechtsklick
    const LANG_MS = 550, LANG_TOL = 10;
    let langDruck = null;
    function langDruckStart(e, sx, sy) {
      langDruckAus();
      const id = e.pointerId;
      const ld = { id, x: sx, y: sy };
      ld.timer = setTimeout(() => {
        if (langDruck !== ld) return;
        langDruck = null;
        if (!finger.has(id) || finger.size !== 1 || !aktiv) return;
        // Der Finger verschiebt ab jetzt nicht mehr
        finger.delete(id);
        geste = null; knopfTipp = null; fling.proben = [];
        zugAbbrechen();
        try { canvas.releasePointerCapture(id); } catch (err) { /* schon frei */ }
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (err) { /* ohne Vibration */ } }
        kontextBei(ld.x, ld.y);
      }, LANG_MS);
      langDruck = ld;
    }
    function langDruckAus() { if (langDruck) { clearTimeout(langDruck.timer); langDruck = null; } }

    // Bilddateien aus dem Explorer oder einer anderen App auf die Fläche ziehen
    const hatBildDatei = dt => !!dt && [...(dt.items || [])].some(i => i.kind === 'file' && /^image\//.test(i.type));
    host.addEventListener('dragover', e => {
      if (!aktiv || !hatBildDatei(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    });
    host.addEventListener('drop', e => {
      if (!aktiv || !hatBildDatei(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      messeHost();
      const dateien = [...e.dataTransfer.files].filter(f => /^image\//.test(f.type));
      const [sx, sy] = lokalPunkt(e);
      let [dx, dy] = zuDok(sx, sy);
      (async () => {
        for (const f of dateien) {
          await fuegeBildEin(f, [dx, dy]);
          dx += 24; dy += 24;
        }
      })();
    });

    /* ----- Menü an der Auswahl ----- */

    function baueMenue() {
      const notizen = [...auswahl.keys()].filter(istNotiz);
      const striche = [...auswahl.keys()].filter(e => !istKasten(e) || istText(e));
      const texte = [...auswahl.keys()].filter(istText);
      const bilder = [...auswahl.keys()].filter(istBild);
      // Nur Textmarker ausgewählt: Markerfarben anbieten, sonst die Stiftfarben
      const nurMarker = striche.length && striche.every(e => e.w === 'marker');
      const farben = nurMarker
        ? Object.entries(MARKER).map(([f, c]) => [f, c, MARKERNAMEN[f]]).concat((einst.eigeneMarker || []).map(c => [c, c, 'Eigene Farbe']))
        : Object.entries(TINTE[flaecheThema()]).map(([f, c]) => [f, c, FARBNAMEN[f]]).concat((einst.eigeneFarben || []).map(c => [c, c, 'Eigene Farbe']));
      menue.innerHTML = `
        ${notizen.length === 1 && auswahl.size === 1 ? '<button type="button" data-m="text">Text</button>' : ''}
        ${texte.length === 1 && auswahl.size === 1 ? '<button type="button" data-m="textbearbeiten">Bearbeiten</button>' : ''}
        ${striche.length ? `<span class="lw-menue-farben">${farben.map(([f, c, n]) => `<button type="button" data-tf="${f}" title="${n}" aria-label="Farbe ${n}" style="--farbe:${c}"></button>`).join('')}</span>` : ''}
        ${notizen.length ? `<span class="lw-menue-farben">${Object.entries(NOTIZFARBEN).map(([f, c]) => `<button type="button" data-nf="${f}" title="${NOTIZNAMEN[f]}" aria-label="Notiz ${NOTIZNAMEN[f]}" style="--farbe:${c}"></button>`).join('')}</span>` : ''}
        ${bilder.length === 1 && auswahl.size === 1 && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write ? '<button type="button" data-m="kopieren" title="Bild in die Zwischenablage kopieren">Kopieren</button>' : ''}
        <button type="button" data-m="dup">Duplizieren</button>
        <button type="button" data-m="weg" class="gefahr">Löschen</button>`;
    }
    menue.addEventListener('pointerdown', e => e.stopPropagation());
    menue.addEventListener('click', e => {
      const k = e.target.closest('button');
      if (!k) return;
      if (k.dataset.nf) { L.setzeNotizFarbe(k.dataset.nf); return; }
      if (k.dataset.tf) { L.faerbeAuswahl(k.dataset.tf); return; }
      if (k.dataset.m === 'weg') loescheAuswahl();
      else if (k.dataset.m === 'dup') dupliziereAuswahl();
      else if (k.dataset.m === 'kopieren') kopiereBild([...auswahl.keys()].find(istBild));
      else if (k.dataset.m === 'text') { const [[n, sid]] = [...auswahl]; auswahl.clear(); bearbeiteNotiz(n, sid); }
      else if (k.dataset.m === 'textbearbeiten') { const [[el, sid]] = [...auswahl]; auswahl.clear(); bearbeiteText(el, sid); }
    });
    let menueInhalt = '';
    function positioniereMenue() {
      const r = !aktion && !geste && !editiert && !textEdit ? auswahlRahmen() : null;
      menue.hidden = !r;
      if (!r) { menueInhalt = ''; return; }
      const sig = [...auswahl.keys()].map(e => (istNotiz(e) ? 'n' : istBild(e) ? 'b' : istText(e) ? 't' : e.w === 'marker' ? 'm' : 's')).join('') + flaecheThema();
      if (sig !== menueInhalt) { baueMenue(); menueInhalt = sig; }
      const [x, y] = zuSchirm(r.x1, r.y1);
      const [, y2] = zuSchirm(r.x2, r.y2);
      const mb = menue.offsetWidth, mh = menue.offsetHeight;
      menue.style.left = Math.max(4, Math.min(x, b - mb - 4)) + 'px';
      menue.style.top = (y - mh - 10 >= 4 ? y - mh - 10 : Math.min(h - mh - 4, y2 + 10)) + 'px';
    }
    function loescheAuswahl() {
      if (!auswahl.size) return;
      beginne();
      for (const [el, sid] of auswahl) {
        beruehre(sid);
        const liste = inhalt(sid).e;
        const i = liste.indexOf(el);
        if (i >= 0) liste.splice(i, 1);
      }
      auswahl.clear();
      beende();
      plane();
    }
    function dupliziereAuswahl() {
      if (!auswahl.size) return;
      beginne();
      const neu = [];
      for (const [el, sid] of auswahl) {
        beruehre(sid);
        const k = klon(el);
        k.id = kurzId();
        if (istKasten(k)) { k.x += 24; k.y += 24; k.erstellt = Date.now(); } else k.p = k.p.map(q => punktMit(q, q[0] + 24, q[1] + 24));
        inhalt(sid).e.push(k);
        neu.push([k, sid]);
      }
      auswahl.clear();
      neu.forEach(([k, sid]) => auswahl.set(k, sid));
      beende();
      plane();
    }
    L.loescheAuswahl = loescheAuswahl;
    // Geste ausführen (name: zweiFinger, dreiFinger, zweiFingerLang, pencilDoppel, pencilDruecken). Werkzeuge und Verlauf
    // erledigt die Schreibfläche selbst, alles andere (Seiten-Menü, Leiste, Vollbild, Farben) meldet sie mit "geste".
    L.geste = (name, pos) => {
      const was = Object.assign({}, GESTEN_STANDARD, einst.gesten || {})[name];
      if (!was || was === 'aus' || !GESTEN_AKTIONEN[was]) return;
      if (textEdit) L.beendeText();
      const zeige = t => { if (window.UI && UI.meldung) UI.meldung(t); };
      if (was === 'rueckgaengig') { if (L.kannRueckgaengig()) { L.rueckgaengig(); zeige('Rückgängig'); } else zeige('Nichts rückgängig zu machen'); }
      else if (was === 'wiederholen') { if (L.kannWiederholen()) { L.wiederholen(); zeige('Wiederholt'); } else zeige('Nichts zu wiederholen'); }
      else if (was === 'radierer') L.setzeWerkzeug(einst.werkzeug === 'radierer' ? (vorherigesWerkzeug && vorherigesWerkzeug !== 'radierer' ? vorherigesWerkzeug : letztesSchreibwerkzeug) : 'radierer');
      else if (was === 'letztes') L.setzeWerkzeug(vorherigesWerkzeug && vorherigesWerkzeug !== einst.werkzeug ? vorherigesWerkzeug : letztesSchreibwerkzeug);
      else if (['stift', 'marker', 'lasso', 'text', 'hand', 'laser'].includes(was)) L.setzeWerkzeug(was);
      else {
        // Gesten am Stift (doppelt tippen, zusammendrücken): dort, wo der Stift gerade schwebte
        const beimStift = schwebeOrt && performance.now() - schwebeOrt.t < 4000 ? [schwebeOrt.x, schwebeOrt.y] : null;
        emit('geste', { was, pos: pos || beimStift || [b / 2, h / 2], name });
      }
    };
    // Seite um 90° gedreht (richtung +90 = rechts herum, -90 = links herum; B x H = Grösse vorher): alles darauf dreht
    // mit. Striche Punkt für Punkt; Haftnotizen, Bilder und Text wandern mit ihrer Mitte und bleiben aufrecht lesbar.
    // Danach gibt es kein Rückgängig über die Drehung hinweg (die Drehung selbst steht im Dokument, nicht im Verlauf).
    L.dreheInhalt = (sid, richtung, B, H) => {
      auswahl.clear();
      const inh = inhalt(sid);
      if (inh.e.length) {
        beginne();
        beruehre(sid);
        const dreh = richtung > 0 ? (x, y) => [H - y, x] : (x, y) => [y, B - x];
        for (const el of inh.e) {
          if (istKasten(el)) {
            const g = grenzen(el), cx = (g.x1 + g.x2) / 2, cy = (g.y1 + g.y2) / 2;
            const [nx, ny] = dreh(cx, cy);
            el.x = r1(el.x + nx - cx); el.y = r1(el.y + ny - cy);
          } else el.p = el.p.map(q => { const [nx, ny] = dreh(q[0], q[1]); return punktMit(q, r1(nx), r1(ny)); });
        }
        beende();
      }
      verlauf = []; zukunft = [];
      emit('verlauf');
    };
    // Die Seite, um die es gerade geht (für Drehen in der Werkzeugleiste und in den Gesten)
    L.dreheSeite = richtung => { if (opt.dreheSeite) opt.dreheSeite(richtung); };
    L.kannDrehen = () => !!opt.dreheSeite;
    L.istLeer = () => seiten.every(s => !inhalt(s.id).e.length);
    L.leeren = () => {
      beginne();
      for (const s of seiten) { beruehre(s.id); inhalt(s.id).e = []; }
      auswahl.clear();
      beende();
      plane();
    };

    // Nach Verschieben oder Skalieren gehört jedes Element zu der Seite, auf der seine Mitte liegt
    function neuZuordnen() {
      const umzug = [];
      for (const [el, sid] of auswahl) {
        const g = dokGrenzen(el, sid);
        const ziel = seiteBeiY((g.y1 + g.y2) / 2);
        if (ziel && ziel.id !== sid) umzug.push([el, sid, ziel]);
      }
      for (const [el, sid, ziel] of umzug) {
        const von = seiteMitId(sid);
        beruehre(sid); beruehre(ziel.id);
        const liste = inhalt(sid).e;
        liste.splice(liste.indexOf(el), 1);
        const dx = von.x - ziel.x, dy = von.y - ziel.y;
        if (istKasten(el)) { el.x = r1(el.x + dx); el.y = r1(el.y + dy); }
        else el.p = el.p.map(q => punktMit(q, r1(q[0] + dx), r1(q[1] + dy)));
        inhalt(ziel.id).e.push(el);
        auswahl.set(el, ziel.id);
      }
    }

    /* ----- Eingabe ----- */

    /* ----- Nachlaufen (Schwung): wischt man und lässt los, läuft die Fläche weiter und bremst sanft ab ----- */
    const fling = { proben: [] };
    const flingProbe = (x, y) => {
      const t = performance.now();
      fling.proben.push({ t, x, y });
      while (fling.proben.length > 1 && t - fling.proben[0].t > 100) fling.proben.shift();
    };
    function flingStart() {
      const p = fling.proben;
      fling.proben = [];
      if (p.length < 2) return;
      const a = p[0], c = p[p.length - 1], dt = c.t - a.t;
      // Nur wenn die Bewegung bis kurz vor dem Loslassen lief (wer erst anhält und dann loslässt, will keinen Schwung)
      if (dt < 8 || performance.now() - c.t > 70) return;
      let vx = (c.x - a.x) / dt, vy = (c.y - a.y) / dt;
      const v = Math.hypot(vx, vy);
      if (v < 0.3) return;
      if (v > 7) { vx *= 7 / v; vy *= 7 / v; }
      stoppeAnim();
      let letzte = performance.now();
      const schritt = jetzt => {
        const dt2 = Math.min(40, jetzt - letzte);
        letzte = jetzt;
        const abbremsen = Math.exp(-dt2 / 420);   // Zeitkonstante: nach etwa 0,4 s noch ein gutes Drittel der Geschwindigkeit
        vx *= abbremsen; vy *= abbremsen;
        const nx = ansicht.x + vx * dt2, ny = ansicht.y + vy * dt2;
        ansicht.x = nx; ansicht.y = ny;
        begrenze();
        // Am Rand stoppt die Bewegung in dieser Richtung (keine neue Seite durch Schwung)
        if (Math.abs(ansicht.x - nx) > 0.5) vx = 0;
        if (Math.abs(ansicht.y - ny) > 0.5) vy = 0;
        planeAnsicht();
        animBild = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(schritt) : 0;
      };
      animBild = requestAnimationFrame(schritt);
    }

    function starteGeste() {
      fling.proben = [];
      const p = [...finger.values()];
      if (!p.length) { geste = null; return; }
      if (p.length === 1) { geste = { art: 1, x: p[0][0], y: p[0][1] }; return; }
      zugAbbrechen();   // zwei Finger zoomen, das ist kein Zug für eine neue Seite
      const [a, c] = p;
      const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
      geste = { art: 2, d: Math.hypot(a[0] - c[0], a[1] - c[1]) || 1, s: ansicht.s, wx: (mx - ansicht.x) / ansicht.s, wy: (my - ansicht.y) / ansicht.s };
    }
    function bewegeGeste() {
      const p = [...finger.values()];
      if (geste.art === 1) {
        ansicht.x += p[0][0] - geste.x;
        schiebeY(p[0][1] - geste.y);
        geste.x = p[0][0]; geste.y = p[0][1];
        flingProbe(p[0][0], p[0][1]);
      } else {
        const [a, c] = p;
        const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
        ansicht.s = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, geste.s * Math.hypot(a[0] - c[0], a[1] - c[1]) / geste.d));
        ansicht.x = mx - geste.wx * ansicht.s;
        ansicht.y = my - geste.wy * ansicht.s;
        emit('ansicht', ansicht.s);
      }
      planeAnsicht();
    }

    function neueSeiteZone(dx, dy) {
      const s = seiten[seiten.length - 1];
      if (!s || !opt.neueSeite) return false;
      const y = gesamtHoehe + LUECKE;
      return dx >= -s.b / 2 && dx <= s.b / 2 && dy >= y && dy <= y + NEUE_SEITE_H;
    }

    function starteVerschieben(e, dx, dy) {
      beginne();
      for (const sid of new Set(auswahl.values())) beruehre(sid);
      aktion = { art: 'verschieben', id: e.pointerId, x: dx, y: dy, bewegt: false, touch: e.pointerType === 'touch' };
      canvas.setPointerCapture(e.pointerId);
      plane();
    }
    function starteSkalieren(e, ecke) {
      const r = auswahlRahmen();
      const ek = ecken(r);
      const anker = ek[(ecke + 2) % 4];
      const griff = ek[ecke];
      beginne();
      const original = new Map();
      for (const [el, sid] of auswahl) { beruehre(sid); original.set(el, klon(el)); }
      aktion = { art: 'skalieren', id: e.pointerId, anker, start: Math.hypot(griff[0] - anker[0], griff[1] - anker[1]) || 1, original, touch: e.pointerType === 'touch' };
      canvas.setPointerCapture(e.pointerId);
    }

    // Punkt auf einer Haftnotiz, in Koordinaten der Notiz und auf ihre Fläche unter der Kopfleiste begrenzt
    function notizPunkt(e, s, n, filter) {
      const p = stiftPunkt(e, s, filter);
      p[0] = r1(Math.max(0, Math.min(n.b, p[0] - n.x)));
      p[1] = r1(Math.max(NOTIZ_KOPF, Math.min(n.h, p[1] - n.y)));
      return p;
    }

    // Knöpfe und Griffe einer Haftnotiz; true, wenn der Druck damit erledigt ist
    function notizBedienen(e, teil, dx, dy) {
      const { n, sid, was } = teil;
      const touch = e.pointerType === 'touch';
      if (was === 'zu') { aendereNotiz(n, sid, x => { if (x.zu) delete x.zu; else x.zu = true; }); return true; }
      if (was === 'mehr') { zeigeNotizMenue(n, sid); return true; }
      if (was === 'groesse') {
        // Nicht kleiner als die Zeichnung darauf
        let minB = NOTIZ_MIN.b, minH = NOTIZ_MIN.h;
        for (const st of n.e || []) for (const [x, y] of st.p) { minB = Math.max(minB, x + 4); minH = Math.max(minH, y + 4); }
        beginne();
        beruehre(sid);
        aktion = { art: 'notizGroesse', id: e.pointerId, n, sid, b: n.b, h: n.h, x: dx, y: dy, minB, minH, touch };
        canvas.setPointerCapture(e.pointerId);
        return true;
      }
      if (was === 'kopf') {
        auswahl.clear();
        auswahl.set(n, sid);
        beginne();
        beruehre(sid);
        aktion = { art: 'notiz', id: e.pointerId, x: dx, y: dy, bewegt: false, treffer: { n, sid }, kopf: true, touch };
        canvas.setPointerCapture(e.pointerId);
        return true;
      }
      return false;
    }

    // Ein zweiter Finger kam dazu: Striche und Lasso verwerfen, alles andere abschliessen
    function brichAbFuerGeste() {
      const a = aktion;
      aktion = null;
      host.classList.remove('schiebt');
      if (!a) return;
      clearTimeout(a.halteTimer);
      if (a.art === 'lasso') lassoPunkte = null;
      if (['zeichnen', 'lasso', 'schieben', 'knopf'].includes(a.art)) { plane(); return; }
      abschliessen(a, null);
    }

    // Rechtsklick mit der Maus: wie langes Drücken mit dem Finger (Bild auswählen oder "Bild einfügen"). Touch meldet das
    // selbst (langDruckStart), die Seitentaste des Stifts bleibt bei ihrer Belegung.
    let letzterZeiger = '';
    canvas.addEventListener('pointerdown', e => { letzterZeiger = e.pointerType; }, true);
    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (!aktiv || letzterZeiger !== 'mouse' || aktion) return;
      messeHost();
      const [sx, sy] = lokalPunkt(e);
      kontextBei(sx, sy, true);
    });

    canvas.addEventListener('pointerdown', e => {
      if (!aktiv) return;
      stoppeAnim();
      if (!aktion && !finger.size) zug.erledigt = false;
      messeHost();
      hinweis.classList.add('weg');
      schliesseNotizMenue();
      if (editiert) { editor.blur(); }
      const [sx, sy] = lokalPunkt(e);
      const [dx, dy] = zuDok(sx, sy);
      const touch = e.pointerType === 'touch';
      // Stift oder Maus neben das Textfeld: fertig geschrieben (mit dem Text-Werkzeug ist das Tippen damit erledigt).
      // Finger verschieben und zoomen weiter, ohne das Schreiben zu beenden; ein Tippen beendet es (siehe ende).
      if (textEdit && !touch) {
        textOffenSeit = textHalten = 0;
        beendeText();
        if (einst.werkzeug === 'text') { e.preventDefault(); return; }
      }

      if (touch) {
        // Handballen werden während und kurz nach dem Stift ignoriert
        if (performance.now() - penZeit < 700) return;
        // Sehr grosse Berührfläche (Handballen, Faust): kein Finger. Geräte ohne Angabe melden 0 oder 1 und bleiben unberührt.
        if (Math.max(e.width || 0, e.height || 0) > 72) return;
        touchPos.set(e.pointerId, [sx, sy]);
        langDruckAus();
        // Gesten: alle Finger dieser Berührung zählen (erster Finger beginnt eine neue)
        if (touchPos.size === 1 || !tippen) tippen = { start: performance.now(), max: 0, bewegt: false, pos: new Map(), lang: 0, fertig: false };
        tippen.pos.set(e.pointerId, [sx, sy]);
        tippen.max = Math.max(tippen.max, tippen.pos.size);
        if (tippen.pos.size === 2 && !tippen.lang) {
          const t = tippen;
          // Halten verzeiht mehr als Tippen: ruhende Finger wandern auf dem Glas ein paar Pixel (HALTEN_TOL), und ein
          // dritter Kontakt (Handballen am Rand) bricht es nicht ab
          t.lang = setTimeout(() => {
            if (tippen !== t || t.weit || t.fertig || t.pos.size < 2) return;
            t.fertig = true;
            const [a, c] = [...t.pos.values()];
            brichAbFuerGeste();
            L.geste('zweiFingerLang', [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]);
          }, HALTEN_MS);
        }
        // Text: ein Finger tippt einen Text an oder setzt einen neuen (erst beim Loslassen, Wischen scrollt weiter).
        // Ohne die Maus-Ereignisse danach, sonst verliert das Textfeld auf dem iPad gleich wieder den Fokus.
        if (einst.werkzeug === 'text' || textEdit) {
          e.preventDefault();
          textFingerTipp = !finger.size && !aktion ? { id: e.pointerId, x: sx, y: sy, bewegt: false } : null;
        }
        if (aktion) {
          // Schreibt schon ein Finger, macht ein zweiter daraus eine Geste (verschieben, zoomen)
          if (!aktion.touch || finger.size) return;
          const erster = aktion.id;
          brichAbFuerGeste();
          finger.set(erster, touchPos.get(erster) || [sx, sy]);
          canvas.setPointerCapture(e.pointerId);
          finger.set(e.pointerId, [sx, sy]);
          starteGeste();
          return;
        }
        // Der Laserpointer folgt dem Finger immer (zwei Finger verschieben und zoomen auch dann)
        const fingerSchreibt = (einst.finger || einst.werkzeug === 'laser') && einst.werkzeug !== 'hand' && !finger.size;
        if (!fingerSchreibt) {
          if (!finger.size) {
            const teil = notizTeilBei(dx, dy);
            if (teil && teil.was !== 'flaeche' && notizBedienen(e, teil, dx, dy)) return;
            // Auf die Fläche einer Haftnotiz getippt (nicht gewischt): Text schreiben, erst dann kommt die Tastatur.
            // Ohne die Maus-Ereignisse danach, sonst verliert das Textfeld auf dem iPad gleich wieder den Fokus.
            if (teil && teil.was === 'flaeche') { e.preventDefault(); notizFingerTipp = { id: e.pointerId, x: sx, y: sy, bewegt: false, n: teil.n, sid: teil.sid }; }
            // Ausgewählt (z. B. ein eben eingefügtes Bild): an den Ecken ziehen ändert die Grösse, innen verschiebt
            if (auswahl.size) {
              const ecke = griffBei(dx, dy, 26);
              if (ecke >= 0) { starteSkalieren(e, ecke); return; }
              if (inAuswahl(dx, dy)) { starteVerschieben(e, dx, dy); return; }
            }
            // Auf dem Feld "Neue Seite": Tippen legt die Seite an, Wischen verschiebt wie überall (und darüber hinaus
            // gezogen entsteht sie von selbst)
            if (neueSeiteZone(dx, dy)) knopfTipp = { id: e.pointerId, x: sx, y: sy, bewegt: false };
            // Lange ruhig liegen lassen: Bild auswählen oder "Bild einfügen"
            else langDruckStart(e, sx, sy);
          }
          canvas.setPointerCapture(e.pointerId);
          finger.set(e.pointerId, [sx, sy]);
          starteGeste();
          return;
        }
        // Mit dem Finger schreiben: weiter wie mit dem Stift
      }
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
      e.preventDefault();
      finger.clear(); geste = null;
      // Hängengebliebene Aktion (Loslassen kam nie an): abschliessen statt alles zu blockieren
      if (aktion) {
        lassoPunkte = null; radiererPunkt = null;
        if (tx) beende();
        aktion = null;
        host.classList.remove('schiebt');
      }
      canvas.setPointerCapture(e.pointerId);

      // Mittlere Maustaste oder Leertaste: Fläche verschieben
      if (e.pointerType === 'mouse' && (e.button === 1 || leertaste)) {
        aktion = { art: 'schieben', id: e.pointerId, x: sx, y: sy };
        host.classList.add('schiebt');
        aktualisiereCursor();
        return;
      }
      if (e.pointerType === 'pen') { penZeit = performance.now(); letzterRoh = e.pressure > 0 ? e.pressure : 0.5; rohProben = []; tastenTest(e); schwebeWeg(); }

      if (neueSeiteZone(dx, dy) && einst.werkzeug !== 'laser') { aktion = { art: 'knopf', id: e.pointerId, touch }; return; }

      const wz = werkzeugFuer(e);
      const teil = notizTeilBei(dx, dy);
      // Zuklappen und ⋯ gehen mit jedem Werkzeug
      if (teil && (teil.was === 'zu' || teil.was === 'mehr')) { notizBedienen(e, teil, dx, dy); return; }
      // Hand: Fläche verschieben
      if (wz === 'hand') {
        aktion = { art: 'schieben', id: e.pointerId, x: sx, y: sy, touch };
        fling.proben = [];
        host.classList.add('schiebt');
        return;
      }
      // Laserpointer: nur ein leuchtender Punkt mit Spur, es wird nichts gezeichnet, ausgewählt oder gespeichert
      if (wz === 'laser') {
        auswahl.clear();
        aktion = { art: 'laser', id: e.pointerId, touch };
        laserPunkt(e);
        return;
      }
      if (auswahl.size && wz !== 'radierer') {
        const ecke = griffBei(dx, dy);
        if (ecke >= 0) { starteSkalieren(e, ecke); return; }
        if (inAuswahl(dx, dy)) { starteVerschieben(e, dx, dy); return; }
      }
      // Kopfleiste verschiebt die Notiz, die Ecke unten rechts macht sie grösser
      if (teil && (teil.was === 'kopf' || teil.was === 'groesse') && wz !== 'radierer' && wz !== 'lasso' && notizBedienen(e, teil, dx, dy)) return;
      const s = seiteBeiY(dy);
      if (!s) return;

      if (wz === 'lasso') {
        auswahl.clear();
        lassoPunkte = [[dx, dy]];
        aktion = { art: 'lasso', id: e.pointerId, touch };
        plane();
        return;
      }
      auswahl.clear();
      if (wz === 'radierer') {
        beginne();
        aktion = { art: 'radieren', id: e.pointerId, touch };
        radiere(dx, dy);
        return;
      }
      if (wz === 'notiz') {
        const treffer = notizBei(dx, dy);
        if (treffer) {
          auswahl.set(treffer.n, treffer.sid);
          beginne();
          beruehre(treffer.sid);
          aktion = { art: 'notiz', id: e.pointerId, x: dx, y: dy, bewegt: false, treffer, touch };
          return;
        }
        if (opt.begrenzt && !aufSeite(s, dx, dy)) return;
        const [x, y] = lokal(s, dx, dy);
        const gr = 180;
        const n = { typ: 'notiz', id: kurzId(), x: r1(x - gr / 2), y: r1(y - NOTIZ_KOPF / 2), b: gr, h: gr, f: einst.notizFarbe || 'gelb', t: '', gr: 18, erstellt: Date.now() };
        if (opt.begrenzt) aufsBlatt(n, s);
        beginne();
        beruehre(s.id);
        inhalt(s.id).e.push(n);
        beende();
        // Keine Tastatur: auf der neuen Notiz schreibt man gleich mit dem Stift. Dafür geht es zurück
        // zum letzten Schreibwerkzeug. Tippen schreibt Text: Finger auf die Notiz, oder Stift mit dem Notiz-Werkzeug.
        einst.werkzeug = letztesSchreibwerkzeug;
        opt.einstGeaendert && opt.einstGeaendert();
        emit('werkzeug', einst.werkzeug);
        plane();
        return;
      }
      // Text: tippen setzt oder bearbeitet (beim Loslassen), auf einem Text ziehen verschiebt ihn
      if (wz === 'text') {
        aktion = { art: 'textTipp', id: e.pointerId, x: dx, y: dy, treffer: textBei(dx, dy), touch };
        return;
      }
      const marker = wz === 'marker';
      const strich = { id: kurzId(), w: marker ? 'marker' : 'stift', f: marker ? einst.markerFarbe || 'gelb' : einst.farbe, d: marker ? einst.markerDicke || einst.dicke : stiftDicke(einst) };
      // Auf einer Haftnotiz gehört der Strich zur Notiz: er wandert mit, wird mit ihr zugeklappt und gelöscht
      const t = notizBei(dx, dy);
      if (t && !t.n.zu) {
        strich.p = [notizPunkt(e, seiteMitId(t.sid), t.n)];
        aktion = { art: 'zeichnen', id: e.pointerId, sid: t.sid, notiz: t.n, strich, touch };
        schreibStart(aktion, sx, sy, e);
        anfordern();
        return;
      }
      if (opt.begrenzt && !aufSeite(s, dx, dy)) return;   // neben dem Blatt wird nicht geschrieben
      strich.p = [stiftPunkt(e, s)];
      aktion = { art: 'zeichnen', id: e.pointerId, sid: s.id, strich, touch };
      schreibStart(aktion, sx, sy, e);
      anfordern();
    });

    // Glättung und Haltezeit für einen neuen Strich
    function schreibStart(a, sx, sy, e) {
      // Glättung in Bildschirm-px, gerechnet in Einheiten der Seite; das Fenster reicht über 2,5 Sigma (Punkte liegen
      // mindestens 0,8 px auseinander)
      const px = GLAETTUNG[einst.glaettung] != null ? GLAETTUNG[einst.glaettung] : GLAETTUNG.niedrig;
      a.sigma = px / ansicht.s;
      a.fenster = px > 0 ? Math.ceil(px * 2.5 / 0.8) : 0;
      a.roh = [a.strich.p[0]];
      a.weg = [0];
      // Für die Stiftart: wann jeder Punkt kam (Tempo), wie der Stift gedreht war (Feder), ob er Druck meldet
      a.zeit = [e && e.timeStamp ? e.timeStamp : performance.now()];
      a.dreh = [(e && e.twist) || 0];
      a.hatDreh = !!(e && e.twist);
      a.zoom = ansicht.s;
      a.stiftDruck = !!(e && e.pointerType === 'pen' && einst.druck);
      a.stil = a.strich.w === 'stift' ? stiftArt(einst) : null;
      if (a.stil) a.strich.p = [festerPunkt(a, 0)];
      halteStarten(a, sx, sy);
      emit('schreibstart');
    }

    // Punkt zum Strich unter dem Stift; false, wenn er zu nah am letzten liegt (Rauschen des Stifts).
    // letzter: der Punkt beim Abheben, ohne Glättung, damit der Strich genau dort endet, wo der Stift war
    function strichPunkt(ev, letzterPunkt) {
      const a = aktion, s = seiteMitId(a.sid);
      if (!s) return false;
      const pt = a.notiz ? notizPunkt(ev, s, a.notiz) : stiftPunkt(ev, s);
      if (a.formFertig) return passeFormAn(a, pt);
      const roh = a.roh, letzter = roh[roh.length - 1];
      const d = Math.hypot(pt[0] - letzter[0], pt[1] - letzter[1]);
      if (d < 0.8 / ansicht.s && !(letzterPunkt && d > 0.05)) return false;
      roh.push(pt);
      a.weg.push(a.weg[a.weg.length - 1] + d);
      a.zeit.push(ev.timeStamp || performance.now());
      a.dreh.push(ev.twist || 0);
      if (ev.twist) a.hatDreh = true;
      festige(a, false);
      return true;
    }

    /* ----- Halten: Linie und Form ----- */

    // Hält man den Stift am Ende eines Strichs ruhig (einst.halteMs), wird daraus eine gerade Linie, ein Pfeil (Schaft
    // mit zwei Widerhaken in einem Zug) oder, bei einem geschlossenen Strich, ein Dreieck, Viereck, Rechteck, Vieleck,
    // Kreis oder eine Ellipse aus den gezeichneten Punkten. Die Form ersetzt den Strich und bleibt nach dem Loslassen
    // stehen, mit Farbe und Dicke des Strichs. Mit Rückgängig kommt die Originalzeichnung zurück (siehe uebernehme).
    function halteStarten(a, sx, sy) {
      clearTimeout(a.halteTimer);
      a.halteAnker = [sx, sy];
      if (einst.halteForm === false || a.formFertig || !window.LHFormen) return;
      a.halteTimer = setTimeout(() => halteAusloesen(a), haltezeit(einst));
    }
    function halteAusloesen(a) {
      a.halteTimer = 0;
      if (aktion !== a || a.art !== 'zeichnen' || a.formFertig) return;
      const p = a.strich.p.concat(offenePunkte(a));
      if (p.length < 3) return;
      // Ein Zickzack ist ein Kritzeln und bleibt, wie es ist
      if (kritzelAktiv() && LHFormen.istKritzel(p.map(q => [q[0] * ansicht.s, q[1] * ansicht.s]))) return;
      const erg = LHFormen.erkenne(p);
      if (!erg) return;
      a.original = vereinfache(klon({ ...a.strich, p }));
      // Gleichmässig dick: mittlerer Druck des gezeichneten Strichs
      const druecke = p.map(q => q[2] == null ? 0.5 : q[2]).sort((x, y) => x - y);
      const druck = stufe(druecke[Math.floor(druecke.length / 2)], DRUCK_STUFEN);
      a.strich.p = erg.punkte.map(([x, y]) => [r1(x), r1(y), druck]);
      a.formFertig = true;
      a.form = erg.art;
      // Weiter halten und ziehen passt die Form an (passeFormAn): Linie und Pfeil drehen und strecken sich um ihren Anfang,
      // geschlossene Formen wachsen oder schrumpfen um ihre Mitte, stufenlos
      const offen = erg.art === 'linie' || erg.art === 'pfeil';
      const fp = a.strich.p;
      a.formBasis = fp.map(q => q.slice());
      a.formDreht = offen;
      a.formAnker = offen ? fp[0].slice(0, 2) : [fp.reduce((t, q) => t + q[0], 0) / fp.length, fp.reduce((t, q) => t + q[1], 0) / fp.length];
      a.formStift = a.roh[a.roh.length - 1].slice(0, 2);
      a.formFrei = false;
      a.gemalt = null;
      a.fertig = true;
      anfordern();
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* ohne Vibration */ } }
    }
    const kritzelAktiv = () => einst.kritzelLoeschen !== false;
    // Die eingerastete Form folgt dem Stift: so, dass der Punkt unter dem Stift beim Einrasten jetzt unter dem Stift liegt
    // (Abstand zum Anker ergibt die Grösse, bei Linie und Pfeil der Winkel die Richtung). Erst ab HALTE_TOL Bewegung,
    // damit das Zittern beim Einrasten nichts verschiebt.
    function passeFormAn(a, pt) {
      const b = a.formBasis;
      if (!b) return false;
      const [ax, ay] = a.formAnker, [sx, sy] = a.formStift;
      if (!a.formFrei) {
        if (Math.hypot(pt[0] - sx, pt[1] - sy) * ansicht.s < HALTE_TOL) return false;
        a.formFrei = true;
      }
      const vx = sx - ax, vy = sy - ay, wx = pt[0] - ax, wy = pt[1] - ay, l0 = Math.hypot(vx, vy);
      if (l0 < 1e-3) return false;
      const f = Math.max(0.05, Math.hypot(wx, wy) / l0);
      let cos = 1, sin = 0;
      if (a.formDreht) { const w = Math.atan2(wy, wx) - Math.atan2(vy, vx); cos = Math.cos(w); sin = Math.sin(w); }
      a.strich.p = b.map(q => {
        const dx = q[0] - ax, dy = q[1] - ay;
        return [r1(ax + f * (dx * cos - dy * sin)), r1(ay + f * (dx * sin + dy * cos)), q[2]];
      });
      a.gemalt = null;
      return true;
    }

    // Was der Stift meldet (Druck, Neigung, Drehung), für die Diagnose; höchstens einmal pro Bild weitergegeben
    function diagMelden(e) {
      diagProbe = stiftDaten(e);
      diagProbe.roh = e.pressure;
      if (diagGeplant) return;
      diagGeplant = true;
      requestAnimationFrame(() => { diagGeplant = false; if (diagProbe) emit('stiftdaten', diagProbe); });
    }

    canvas.addEventListener('pointermove', e => {
      // Ein Stift in Reichweite, auch ohne die Fläche zu berühren: danach kommende Berührungen sind meist der Handballen
      if (e.pointerType === 'pen') penZeit = performance.now();
      const diag = e.pointerType === 'pen' && opt.stifttasteTest && opt.stifttasteTest();
      if (diag) diagMelden(e);
      const [sx, sy] = lokalPunkt(e);
      // Der Stift schwebt über dem Blatt (berührt es nicht): Vorschau-Punkt, und die Stelle für die Palette am Stift
      if (e.pointerType === 'pen' && !aktion && !e.buttons && !(e.pressure > 0)) { schwebeOrt = { x: sx, y: sy, t: performance.now() }; if (schwebeAn()) setzeSchwebe(sx, sy); }
      if (touchPos.has(e.pointerId)) touchPos.set(e.pointerId, [sx, sy]);
      if (tippen && tippen.pos.has(e.pointerId) && !tippen.bewegt) {
        const q = tippen.pos.get(e.pointerId);
        const weg = Math.hypot(sx - q[0], sy - q[1]);
        if (weg > TIPP_TOL) tippen.bewegt = true;
        if (weg > HALTEN_TOL) tippen.weit = true;
      }
      if (finger.has(e.pointerId)) {
        finger.set(e.pointerId, [sx, sy]);
        if (knopfTipp && knopfTipp.id === e.pointerId && Math.hypot(sx - knopfTipp.x, sy - knopfTipp.y) > 8) knopfTipp.bewegt = true;
        if (textFingerTipp && (textFingerTipp.id !== e.pointerId || Math.hypot(sx - textFingerTipp.x, sy - textFingerTipp.y) > 8)) textFingerTipp.bewegt = true;
        if (notizFingerTipp && (notizFingerTipp.id !== e.pointerId || Math.hypot(sx - notizFingerTipp.x, sy - notizFingerTipp.y) > 8)) notizFingerTipp.bewegt = true;
        if (langDruck && langDruck.id === e.pointerId && Math.hypot(sx - langDruck.x, sy - langDruck.y) > LANG_TOL) langDruckAus();
        if (geste) bewegeGeste();
        return;
      }
      // Der Laserpointer leuchtet nur, solange der Stift aufliegt, die Maus- bzw. Touchpad-Taste gedrückt ist oder der
      // Finger auf der Fläche ist (aktion 'laser'); beim Schweben zeigt nur der Mauszeiger, wo er aufleuchten würde
      if (!aktion || e.pointerId !== aktion.id) return;
      if (e.pointerType === 'pen') { penZeit = performance.now(); if (diag) tastenTest(e); }

      if (aktion.art === 'schieben') {
        ansicht.x += sx - aktion.x; schiebeY(sy - aktion.y);
        aktion.x = sx; aktion.y = sy;
        flingProbe(sx, sy);
        planeAnsicht();
        return;
      }

      // Bewegt sich der Stift mehr als nur zittrig, beginnt das Warten auf "Halten" von vorn
      if (aktion.art === 'zeichnen' && !aktion.formFertig && (!aktion.halteAnker || Math.hypot(sx - aktion.halteAnker[0], sy - aktion.halteAnker[1]) > HALTE_TOL)) halteStarten(aktion, sx, sy);

      // Alle Zwischenpunkte, die der Stift seit dem letzten Ereignis geliefert hat (oft 2 bis 4 pro Bild)
      const gesammelt = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ev of gesammelt.length ? gesammelt : [e]) {
        const [qx, qy] = lokalPunkt(ev);
        const [dx, dy] = zuDok(qx, qy);
        if (aktion.art === 'zeichnen') {
          // Nur den Punkt merken; gemalt wird im nächsten Bild (requestAnimationFrame)
          if (strichPunkt(ev)) anfordern();
        } else if (aktion.art === 'radieren') {
          radiere(dx, dy);
        } else if (aktion.art === 'laser') {
          laserPunkt(ev);
        } else if (aktion.art === 'lasso') {
          lassoPunkte.push([dx, dy]);
          anfordern();
        } else if (aktion.art === 'textTipp') {
          if (aktion.treffer && Math.hypot(dx - aktion.x, dy - aktion.y) * ansicht.s > 6) {
            const { el, sid } = aktion.treffer, x0 = aktion.x, y0 = aktion.y;
            auswahl.clear();
            auswahl.set(el, sid);
            starteVerschieben(ev, x0, y0);
            aktion.bewegt = true;
            el.x += dx - x0; el.y += dy - y0;
            aktion.x = dx; aktion.y = dy;
            plane();
          }
        } else if (aktion.art === 'verschieben' || aktion.art === 'notiz') {
          const ddx = dx - aktion.x, ddy = dy - aktion.y;
          if (!aktion.bewegt && Math.hypot(ddx, ddy) * ansicht.s < 4) continue;
          aktion.x = dx; aktion.y = dy;
          aktion.bewegt = true;
          for (const [el] of auswahl) {
            if (istKasten(el)) { el.x += ddx; el.y += ddy; } else for (const q of el.p) { q[0] += ddx; q[1] += ddy; }
          }
          plane();
        } else if (aktion.art === 'skalieren') {
          const { anker, start, original } = aktion;
          const f = Math.max(0.05, Math.min(40, Math.hypot(dx - anker[0], dy - anker[1]) / start));
          for (const [el, sid] of auswahl) {
            const s = seiteMitId(sid), o = original.get(el);
            const ax = anker[0] - s.x, ay = anker[1] - s.y;
            if (istNotiz(el)) {
              el.x = ax + (o.x - ax) * f; el.y = ay + (o.y - ay) * f;
              el.b = Math.max(30, o.b * f); el.h = Math.max(30, o.h * f);
              el.gr = Math.max(6, (o.gr || 18) * f);
              // Die Zeichnung auf der Notiz wächst mit
              if (o.e) el.e = o.e.map(st => ({ ...st, d: Math.max(0.3, st.d * f), p: st.p.map(q => punktMit(q, q[0] * f, q[1] * f)) }));
            } else if (istText(el)) {
              // Schrift und Zeilenbreite wachsen mit, wie bei einem Bild
              const ft = Math.max(f, 4 / Math.max(1, o.gr || TEXT_STANDARD));
              el.x = ax + (o.x - ax) * ft; el.y = ay + (o.y - ay) * ft;
              el.gr = (o.gr || TEXT_STANDARD) * ft; el.b = (o.b || 600) * ft;
            } else if (istBild(el)) {
              // Seitenverhältnis bleibt; nicht kleiner als 12 Einheiten an der kürzeren Seite
              const fb = Math.max(f, 12 / Math.max(1, Math.min(o.b, o.h)));
              el.x = ax + (o.x - ax) * fb; el.y = ay + (o.y - ay) * fb;
              el.b = o.b * fb; el.h = o.h * fb;
            } else {
              el.d = Math.max(0.3, o.d * f);
              el.p = o.p.map(q => punktMit(q, ax + (q[0] - ax) * f, ay + (q[1] - ay) * f));
            }
          }
          plane();
        } else if (aktion.art === 'notizGroesse') {
          const a = aktion, n = a.n, s = seiteMitId(a.sid);
          let nb = Math.max(a.minB, a.b + dx - a.x), nh = Math.max(a.minH, a.h + dy - a.y);
          if (opt.begrenzt && s) {
            nb = Math.min(nb, Math.max(a.minB, s.b - n.x));
            if (!s.endlos) nh = Math.min(nh, Math.max(a.minH, s.h - n.y));
          }
          n.b = nb; n.h = nh;
          plane();
        }
      }
      if (aktion && aktion.art === 'zeichnen') { aktion.spitze = spitzenPunkte(e); anfordern(); }
    });

    // Wo der Stift gerade wirklich ist (ohne Glättung) und wohin er laut Browser gleich geht (getPredictedEvents):
    // nur für die Spitze, nie gespeichert. Druck und gelernter Druck bleiben davon unberührt.
    function spitzenPunkte(e) {
      const a = aktion, s = seiteMitId(a.sid);
      if (!s || a.formFertig) return [];
      const vorher = letzterRoh, proben = rohProben.length;
      const punkt = ev => (a.notiz ? notizPunkt(ev, s, a.notiz) : stiftPunkt(ev, s));
      const raus = [];
      try {
        const letzter = a.roh[a.roh.length - 1];
        const jetzt = punkt(e);
        if (Math.hypot(jetzt[0] - letzter[0], jetzt[1] - letzter[1]) > 0.05) raus.push(jetzt);
        const vor = e.getPredictedEvents ? e.getPredictedEvents() : [];
        const [ex, ey] = lokalPunkt(e);
        for (const ev of vor.slice(0, 2)) {
          const [vx, vy] = lokalPunkt(ev);
          if (Math.hypot(vx - ex, vy - ey) > 24) break;   // zu weit voraus geraten: lieber nicht
          raus.push(punkt(ev));
        }
      } finally { letzterRoh = vorher; rohProben.length = proben; }
      return raus;
    }

    function ende(e) {
      touchPos.delete(e.pointerId);
      if (tippen && tippen.pos.has(e.pointerId)) {
        const t = tippen;
        t.pos.delete(e.pointerId);
        if (e.type === 'pointercancel') t.bewegt = true;
        if (!t.pos.size) {
          clearTimeout(t.lang);
          tippen = null;
          // Zwei oder drei Finger kurz getippt: Geste (ein angefangener Strich mit dem Finger ist schon verworfen)
          if (!t.bewegt && !t.fertig && t.max >= 2 && performance.now() - t.start < TIPP_MS) {
            const g = t.max === 2 ? 'zweiFinger' : 'dreiFinger';
            setTimeout(() => L.geste(g), 0);
          }
        }
      }
      if (langDruck && langDruck.id === e.pointerId) langDruckAus();
      if (finger.has(e.pointerId)) {
        if (knopfTipp && knopfTipp.id === e.pointerId) {
          const t = knopfTipp;
          knopfTipp = null;
          if (!t.bewegt && e.type === 'pointerup' && finger.size === 1 && opt.neueSeite) opt.neueSeite();
        }
        if (notizFingerTipp && notizFingerTipp.id === e.pointerId) {
          const t = notizFingerTipp;
          notizFingerTipp = null;
          if (!t.bewegt && e.type === 'pointerup' && finger.size === 1 && !zug.px && inhalt(t.sid).e.includes(t.n)) bearbeiteNotiz(t.n, t.sid);
        }
        if (textFingerTipp && textFingerTipp.id === e.pointerId) {
          const t = textFingerTipp;
          textFingerTipp = null;
          if (!t.bewegt && e.type === 'pointerup' && finger.size === 1) {
            if (textEdit) { textOffenSeit = textHalten = 0; beendeText(); }
            else if (einst.werkzeug === 'text') { const [tdx, tdy] = zuDok(t.x, t.y); textTippBei(tdx, tdy); }
          }
        }
        finger.delete(e.pointerId);
        const keinerMehr = !finger.size;
        const zog = zug.px > 0;
        if (keinerMehr && !zog) flingStart();   // vor starteGeste, das die Messpunkte löscht
        starteGeste();
        if (keinerMehr) zugEnde();
        return;
      }
      if (!aktion || e.pointerId !== aktion.id) return;
      const a = aktion;
      aktion = null;
      host.classList.remove('schiebt');
      if (e.pointerType === 'pen') penZeit = performance.now();
      clearTimeout(a.halteTimer);
      if (a.art === 'zeichnen' && e.type === 'pointerup') { aktion = a; strichPunkt(e, true); aktion = null; }   // der letzte Punkt beim Abheben
      if (a.art === 'zeichnen' && !a.formFertig) { festige(a, true); if (a.stil === 'pinsel') pinselAuslauf(a); }
      abschliessen(a, e);
    }

    // Fertigen Strich in die Seite übernehmen: mit Zeitpunkt, als Schritt im Verlauf, zum Speichern vorgemerkt,
    // und auf das Blatt malen, ohne es ganz neu aufzubauen
    function uebernehme(a) {
      const st = a.strich, inh = inhalt(a.sid);
      st.m = Date.now();
      // Ein Zickzack über Geschriebenem löscht es und bleibt selbst nicht stehen
      if (!a.original && ueberkritzelt(a)) return;
      // Auf einen eben gezogenen Kreis getippt: was er umschliesst, ist ausgewählt
      if (!a.original && kreisTipp(a)) return;
      kreis = kreisKandidat(a);
      // Alle Punkte bleiben: so sieht der Strich danach genau so aus wie beim Schreiben (test/strich.js: 0 Bildpunkte
      // Unterschied). Reduziert wurden sie früher hier; selbst eng gerechnet änderte das Kanten sichtbar, und es sparte
      // nur noch rund 17 %. Reduziert werden nur die Stücke beim Radieren (künstliche Zwischenpunkte, siehe unten).
      if (a.notiz) {
        if (!inh.e.includes(a.notiz)) { plane(); return; }
        (a.notiz.e || (a.notiz.e = [])).push(st);
        a.notiz.m = st.m;
      } else inh.e.push(st);
      const bezug = { sid: a.sid, notiz: a.notiz || null };
      if (a.original) {
        // Begradigt oder zur Form geworden: zwei Schritte im Verlauf. Rückgängig macht aus der Form zuerst wieder die
        // gezeichnete Linie (Original), ein zweites Rückgängig nimmt sie ganz weg.
        a.original.m = st.m;
        merkeSchritt({ strich: { ...bezug, el: a.original } });
        merkeSchritt({ ersetze: { ...bezug, alt: a.original, neu: st } });
      } else merkeSchritt({ strich: { ...bezug, el: st } });
      speichere(a.sid);
      if (seiten.some(s => s.endlos)) aktualisiereLayout();
      uebernehmeStrich(a);
    }

    // Einkreisen und antippen (wie "Circle to Lasso"): Mit dem Stift etwas einkreisen und dann auf die Kreislinie tippen
    // wählt aus, was der Kreis umschliesst; der Kreis selbst verschwindet (Rückgängig bringt ihn zurück). Ohne das
    // Tippen bleibt er ein ganz normaler Strich. So muss man zum Verschieben nicht erst zum Lasso wechseln.
    const KREIS_MS = 8000;
    let kreis = null;
    const umschlossen = (el, poly) => (istKasten(el)
      ? (g => innen((g.x1 + g.x2) / 2, (g.y1 + g.y2) / 2, poly))(grenzen(el))
      : el.p.filter(q => innen(q[0], q[1], poly)).length >= Math.max(1, el.p.length / 2));
    // Ist der Strich eine geschlossene Runde um etwas herum? Dann merken (kurz), sonst null
    function kreisKandidat(a) {
      const st = a.strich, p = st.p;
      if (einst.kreisAuswahl === false || a.notiz || st.w !== 'stift' || p.length < 8) return null;
      const g = grenzen(st), diag = Math.hypot(g.x2 - g.x1, g.y2 - g.y1);
      if (diag * ansicht.s < 36) return null;
      let lang = 0;
      for (let i = 1; i < p.length; i++) lang += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (lang < 1.9 * diag) return null;
      // Das Ende kommt wieder am Anfang an (oder kreuzt ihn): nah an einem Punkt des ersten Drittels
      const ende = p[p.length - 1], drittel = Math.max(1, Math.floor(p.length / 3));
      let nah = Infinity;
      for (let i = 0; i < drittel; i++) nah = Math.min(nah, Math.hypot(p[i][0] - ende[0], p[i][1] - ende[1]));
      if (nah > 0.2 * diag) return null;
      const inh = inhalt(a.sid);
      if (!inh.e.some(el => el !== st && umschlossen(el, p))) return null;
      return { el: st, sid: a.sid, bis: performance.now() + KREIS_MS };
    }
    function kreisTipp(a) {
      const k = kreis;
      if (!k) return false;
      if (performance.now() > k.bis || a.notiz || a.sid !== k.sid || einst.kreisAuswahl === false) { kreis = null; return false; }
      // Nur ein Tippen (kein Strich) auf oder dicht neben der Kreislinie
      if (a.weg[a.weg.length - 1] * ansicht.s > 6) return false;
      const inh = inhalt(k.sid), q = a.roh[0], p = k.el.p;
      if (!inh.e.includes(k.el)) { kreis = null; return false; }
      const reichweite = breite(k.el, 1) / 2 + 14 / ansicht.s;
      let trifft = false;
      for (let i = 1; i < p.length && !trifft; i++) trifft = abstand(q[0], q[1], p[i - 1], p[i]) <= reichweite;
      if (!trifft) return false;
      const gewaehlt = inh.e.filter(el => el !== k.el && umschlossen(el, p));
      kreis = null;
      if (!gewaehlt.length) return false;
      beginne();
      beruehre(k.sid);
      inh.e.splice(inh.e.indexOf(k.el), 1);
      beende();
      auswahl.clear();
      for (const el of gewaehlt) auswahl.set(el, k.sid);
      olLeeren();
      live.style.opacity = '';
      plane();
      emit('werkzeug', einst.werkzeug);
      return true;
    }

    // Zickzack über Geschriebenem: alles, was zum grössten Teil darunter liegt und vom Gekritzel berührt wird, ist weg.
    // Liegt nichts darunter, bleibt es ein ganz normaler Strich. Ein Schritt im Verlauf (mit Meldung zum Zurücknehmen).
    function ueberkritzelt(a) {
      const st = a.strich;
      if (!kritzelAktiv() || !window.LHFormen || st.w !== 'stift' || st.p.length < 6) return false;
      const zoom = ansicht.s;
      if (!LHFormen.istKritzel(st.p.map(q => [q[0] * zoom, q[1] * zoom]))) return false;
      const inh = inhalt(a.sid);
      if (a.notiz && !inh.e.includes(a.notiz)) return false;
      const liste = a.notiz ? a.notiz.e || [] : inh.e;
      const g = grenzen(st), rand = 4 / zoom;
      const feld = { x1: g.x1 - rand, y1: g.y1 - rand, x2: g.x2 + rand, y2: g.y2 + rand };
      const treffer = [];
      for (const el of liste) {
        if (istKasten(el) || el === st || !el.p.length) continue;
        const ug = umriss(el);
        if (ug.x2 < feld.x1 || ug.x1 > feld.x2 || ug.y2 < feld.y1 || ug.y1 > feld.y2) continue;
        const pts = el.p.length > 1 ? verdichte(el.p, 4) : el.p;
        let drin = 0;
        for (const q of pts) if (q[0] >= feld.x1 && q[0] <= feld.x2 && q[1] >= feld.y1 && q[1] <= feld.y2) drin++;
        if (drin < 0.6 * pts.length) continue;
        // Berührt das Gekritzel den Strich wirklich (und liegt er nicht nur zufällig zwischen den Bahnen)?
        const reichweite = breite(st, 1) / 2 + breite(el, 1) / 2 + 2 / zoom;
        let beruehrt = false;
        for (const q of pts) {
          for (let i = 1; i < st.p.length; i++) if (abstand(q[0], q[1], st.p[i - 1], st.p[i]) <= reichweite) { beruehrt = true; break; }
          if (beruehrt) break;
        }
        if (beruehrt) treffer.push(el);
      }
      if (!treffer.length) return false;
      beginne();
      beruehre(a.sid);
      for (const el of treffer) { const i = liste.indexOf(el); if (i >= 0) liste.splice(i, 1); }
      if (a.notiz && !liste.length) delete a.notiz.e;
      beende();
      olLeeren();
      live.style.opacity = '';
      plane();
      if (window.UI && UI.meldung) {
        UI.meldung(treffer.length === 1 ? 'Überkritzelt: 1 Strich gelöscht' : `Überkritzelt: ${treffer.length} Striche gelöscht`, { text: 'Rückgängig', fn: () => L.rueckgaengig() });
      }
      return true;
    }

    // Punkte eines Strichs auf das Nötige reduzieren (format.js); gibt den Strich zurück
    const vereinfache = st => (window.LHFormat ? LHFormat.vereinfacheStrich(st) : st);
    // Beim Radieren zerfällt ein Strich in Stücke mit zusätzlich eingefügten Punkten: sie werden am Ende vereinfacht
    const radierStuecke = new WeakSet();
    function vereinfacheRadierStuecke() {
      if (!tx) return;
      for (const sid of tx.vorher.keys()) {
        const liste = inhalt(sid).e;
        for (const el of liste) {
          if (istNotiz(el)) { for (const st of el.e || []) if (radierStuecke.has(st)) { vereinfache(st); radierStuecke.delete(st); } }
          else if (radierStuecke.has(el)) { vereinfache(el); radierStuecke.delete(el); }
        }
      }
    }

    const rundeStriche = liste => liste.map(st => ({ ...st, d: Math.round(st.d * 100) / 100, p: st.p.map(q => punktMit(q, r1(q[0]), r1(q[1]))) }));

    function abschliessen(a, e) {
      if (a.art === 'schieben') {
        if (e) { const zog = zug.px > 0; zugEnde(); if (!zog && a.touch !== undefined) flingStart(); } else zugAbbrechen();
      } else if (a.art === 'zeichnen') {
        if (!a.formFertig) lerneDruck();
        uebernehme(a);
        ausstehendeLaden();
        return;
      } else if (a.art === 'laser') {
        laserWeg();
        ausstehendeLaden();
        return;
      } else if (a.art === 'textTipp') {
        if (e && e.type === 'pointerup') { textTippBei(a.x, a.y); return; }
      } else if (a.art === 'radieren') {
        radiererPunkt = null;
        vereinfacheRadierStuecke();
        beende();
      } else if (a.art === 'lasso') {
        auswahl.clear();
        if (lassoPunkte.length > 2) {
          for (const s of seiten) {
            for (const el of inhalt(s.id).e) {
              if (istKasten(el)) {
                const g = grenzen(el);
                if (innen(s.x + (g.x1 + g.x2) / 2, s.y + (g.y1 + g.y2) / 2, lassoPunkte)) auswahl.set(el, s.id);
              } else {
                const drin = el.p.filter(([x, y]) => innen(s.x + x, s.y + y, lassoPunkte)).length;
                if (drin >= Math.max(1, el.p.length / 2)) auswahl.set(el, s.id);
              }
            }
          }
        }
        // Nur getippt statt eingekreist: das Bild darunter auswählen
        if (!auswahl.size && lassoPunkte.length) {
          const xs = lassoPunkte.map(q => q[0]), ys = lassoPunkte.map(q => q[1]);
          if ((Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)) * ansicht.s < 12) {
            const t = textBei(lassoPunkte[0][0], lassoPunkte[0][1]) || bildBei(lassoPunkte[0][0], lassoPunkte[0][1]);
            if (t) auswahl.set(t.el, t.sid);
          }
        }
        lassoPunkte = null;
      } else if (a.art === 'verschieben' && !a.bewegt && e && e.type === 'pointerup' && einst.werkzeug === 'text' && auswahl.size === 1 && istText([...auswahl.keys()][0])) {
        // Ausgewählten Text mit dem Text-Werkzeug nur angetippt: bearbeiten
        tx = null;
        const [[el, sid]] = [...auswahl];
        bearbeiteText(el, sid);
        return;
      } else if (a.art === 'verschieben' || a.art === 'skalieren') {
        for (const [el] of auswahl) {
          if (istText(el)) { el.x = r1(el.x); el.y = r1(el.y); el.b = r1(el.b); el.gr = r1(el.gr); }
          else if (istKasten(el)) {
            el.x = r1(el.x); el.y = r1(el.y); el.b = r1(el.b); el.h = r1(el.h);
            if (a.art === 'skalieren' && el.e) el.e = rundeStriche(el.e);
          } else { el.d = Math.round(el.d * 100) / 100; el.p = el.p.map(q => punktMit(q, r1(q[0]), r1(q[1]))); }
        }
        neuZuordnen();
        if (opt.begrenzt) for (const [el, sid] of auswahl) aufsBlatt(el, seiteMitId(sid));
        beende();
      } else if (a.art === 'notizGroesse') {
        a.n.b = r1(a.n.b); a.n.h = r1(a.n.h);
        beende();
      } else if (a.art === 'notiz') {
        if (a.bewegt) {
          for (const [el] of auswahl) { el.x = r1(el.x); el.y = r1(el.y); }
          neuZuordnen();
          if (opt.begrenzt) for (const [el, sid] of auswahl) aufsBlatt(el, seiteMitId(sid));
          beende();
          auswahl.clear();
        } else {
          tx = null;
          auswahl.clear();
          const { n, sid } = a.treffer;
          // Tippen auf die Kopfleiste klappt eine zugeklappte Notiz auf; mit dem Notiz-Werkzeug wird geschrieben
          if (a.kopf && n.zu) aendereNotiz(n, sid, x => { delete x.zu; });
          else if (!a.kopf || einst.werkzeug === 'notiz') bearbeiteNotiz(n, sid);
        }
      } else if (a.art === 'knopf' && e) {
        const [sx, sy] = lokalPunkt(e);
        const [dx, dy] = zuDok(sx, sy);
        if (neueSeiteZone(dx, dy)) opt.neueSeite();
      }
      plane();
      ausstehendeLaden();
    }
    canvas.addEventListener('pointerup', ende);
    canvas.addEventListener('pointercancel', ende);
    // Safari auf dem iPad: der Apple Pencil darf nie an das System gehen (Scribble = Handschrift in Textfelder,
    // Textauswahl, Lupe). Greift Safari den Stift, bricht es den Strich mit pointercancel ab und die Linie reisst mitten
    // im Schreiben; touch-action: none allein verhindert das in Safari nicht. Die Pointer Events kommen trotzdem. Finger
    // bleiben unberührt (verschieben und zoomen laufen über Pointer Events), ausser ein Finger schreibt gerade.
    // Stift erkannt an touchType (Safari) oder daran, dass gerade ein Stift aufliegt (Pointer Events kommen vor den Touch-Ereignissen)
    let stiftUnten = 0;
    const stiftBeruehrung = e => { if (stiftUnten) return true; for (const t of e.changedTouches || []) if (t.touchType === 'stylus') return true; return false; };
    for (const typ of ['touchstart', 'touchmove', 'touchend']) {
      canvas.addEventListener(typ, e => {
        if (e.cancelable && (stiftBeruehrung(e) || (aktion && aktion.touch && aktion.art === 'zeichnen'))) e.preventDefault();
      }, { passive: false });
    }
    // Wann zuletzt ein Stift da war (alle Schreibflächen): die Ablage auf dem iPad schiebt ihr Schreiben solange auf
    canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'pen') { stiftZuletzt = performance.now(); stiftUnten = e.pointerId + 1; } }, true);
    for (const typ of ['pointerup', 'pointercancel']) canvas.addEventListener(typ, e => { if (e.pointerId + 1 === stiftUnten) stiftUnten = 0; }, true);
    canvas.addEventListener('pointermove', e => { if (e.pointerType === 'pen') stiftZuletzt = performance.now(); }, true);
    // Der Zeiger verlässt die Fläche: der Laserpunkt verblasst mit seiner Spur
    canvas.addEventListener('pointerleave', e => { if (einst.werkzeug === 'laser' && (!aktion || aktion.art !== 'laser') && e.pointerType !== 'touch') laserWeg(); if (e.pointerType === 'pen') schwebeWeg(); });

    // Mausrad und Touchpad: scrollen verschiebt, Strg + Rad (oder Touchpad-Pinch) zoomt
    host.addEventListener('wheel', e => {
      e.preventDefault();
      schliesseNotizMenue();
      const f = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? h : 1;
      if (e.ctrlKey || e.metaKey) {
        messeHost();
        const [x, y] = lokalPunkt(e);
        zoomZeit = performance.now();
        zoomeUm(x, y, Math.exp(-e.deltaY * f * 0.01));
      } else {
        stoppeAnim();
        const amEnde = !!(opt.neueSeite && seiten.length && h && ansicht.y <= untereGrenze() + 2);
        ansicht.x -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * f;
        if (!(e.shiftKey && !e.deltaX)) { ansicht.y -= e.deltaY * f; radUeberzug(e.deltaY * f, amEnde); }
        planeAnsicht();
      }
    }, { passive: false });

    // Tastatur: die Besitzer (Dokument, Whiteboard) leiten hierher weiter
    L.taste = e => {
      if (e.target.matches && e.target.matches('input, select, textarea')) return false;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? L.wiederholen() : L.rueckgaengig(); return true; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); L.wiederholen(); return true; }
      if ((e.ctrlKey || e.metaKey) && (k === '+' || k === '=' || k === '-')) { e.preventDefault(); L.zoome(k === '-' ? 1 / 1.25 : 1.25); return true; }
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (k === ' ') { leertaste = true; host.classList.add('schiebbar'); aktualisiereCursor(); e.preventDefault(); return true; }
      const w = { h: 'hand', p: 'stift', m: 'marker', e: 'radierer', l: 'lasso', n: 'notiz', r: 'laser', t: 'text' }[k];
      if (w) { L.setzeWerkzeug(w); return true; }
      if (k === '0') { einpassen(true); return true; }
      if ((k === 'delete' || k === 'backspace') && auswahl.size) { loescheAuswahl(); return true; }
      if (k === 'escape' && auswahl.size) { auswahl.clear(); plane(); return true; }
      return false;
    };
    window.addEventListener('keyup', e => { if (e.key === ' ') { leertaste = false; host.classList.remove('schiebbar'); aktualisiereCursor(); } });

    /* ----- Lebenszyklus ----- */

    // Grösse folgt dem Fenster. Wird die Trennlinie zwischen zwei Dokumenten gezogen, friert der Besitzer die Grösse ein (friere):
    // dann legt das Ändern der Fläche nicht bei jedem Bild die Zeichenpuffer neu an und malt nicht alles neu, sondern das vorhandene
    // Bild wird nur gestreckt (vorschauBreite, Grafikkarte). Erst beim Auftauen wird einmal richtig neu gemalt.
    // messung zählt die Anpassungen und ihre Dauer (für die Debug-Anzeige und den Vergleich der Varianten).
    let eingefroren = false, frostBreite = 0;
    const messung = { anzahl: 0, ms: 0, maxMs: 0 };
    function groesseGemessen() {
      if (eingefroren) return;
      const t0 = performance.now();
      groesse();
      const d = performance.now() - t0;
      messung.anzahl++; messung.ms += d; if (d > messung.maxMs) messung.maxMs = d;
    }
    const beobachter = 'ResizeObserver' in window ? new ResizeObserver(groesseGemessen) : null;
    if (beobachter) beobachter.observe(host);
    else window.addEventListener('resize', groesseGemessen);
    L.messung = () => ({ ...messung });
    L.messungNull = () => { messung.anzahl = 0; messung.ms = 0; messung.maxMs = 0; };
    // an: einfrieren (das Bild bleibt, wie es ist). aus: auftauen und einmal neu anpassen; zentrieren: die Seite bleibt in der
    // Mitte der veränderten Fläche (x verschiebt sich um die halbe Änderung der Breite)
    L.friere = (an, zentrieren) => {
      if (an) { eingefroren = true; frostBreite = b; return; }
      if (!eingefroren) return;
      eingefroren = false;
      canvas.style.scale = live.style.scale = canvas.style.translate = live.style.translate = '';
      canvas.style.transformOrigin = live.style.transformOrigin = '';
      if (zentrieren && b) { const r = host.getBoundingClientRect(); if (r.width) ansicht.x += (r.width - b) / 2; }
      const t0 = performance.now();
      groesse();
      messung.anzahl++; messung.ms += performance.now() - t0;
    };
    // Eingefroren: das Bild bleibt unverzerrt in seiner Grösse und wandert nur mit, so dass die Seitenmitte der neuen
    // Mitte folgt (früher wurde es auf die neue Breite gestreckt und sah beim Ziehen verzerrt aus). Was dabei neu ins
    // Bild kommt, ist meist schon gemalt ("canvas" ist ringsum grösser); erst beim Loslassen wird einmal neu gemalt.
    L.vorschauBreite = w => {
      if (!eingefroren || !frostBreite) return;
      const dx = Math.round(((w - frostBreite) / 2) * dpr) / dpr;
      canvas.style.translate = live.style.translate = dx + 'px 0';
    };
    L.eingefroren = () => eingefroren;
    alleLeinwaende.add(L);

    L.el = host;
    L.groesse = groesse;
    L.aktiv = an => {
      aktiv = an;
      schieberStill();
      if (!an) {
        if (editiert) editor.blur();
        if (textEdit) L.beendeText();
        schliesseNotizMenue(); langDruckAus(); laserLeeren(); auswahl.clear(); aktion = null; lassoPunkte = null; finger.clear(); touchPos.clear(); geste = null; zug.px = 0; zug.erledigt = false; knopfTipp = null; stoppeAnim();
        sichernJetzt();
      }
      plane();
    };
    // Beim Schliessen des Fensters oder Wechsel der Anwendung ist nichts mehr aufzuschieben
    // Ein offenes Textfeld bleibt offen, sein Text wird aber schon mitgesichert
    const sichernBeiAbschied = () => { if (textEdit) speichere(textEdit.sid); sichernJetzt(); if (window.Daten && Daten.flush) Daten.flush(); };
    L.beendeText = () => { textOffenSeit = textHalten = 0; beendeText(); };
    const sichernWennVerborgen = () => { if (document.hidden) sichernBeiAbschied(); };
    window.addEventListener('pagehide', sichernBeiAbschied);
    window.addEventListener('beforeunload', sichernBeiAbschied);
    window.addEventListener('blur', sichernBeiAbschied);
    document.addEventListener('visibilitychange', sichernWennVerborgen);
    L.zerstoere = () => {
      if (editiert) beendeEditor();
      if (textEdit) L.beendeText();
      schliesseNotizMenue();
      sichernJetzt();
      if (window.Daten && Daten.flush) Daten.flush();
      clearTimeout(schaerfeTimer);
      window.removeEventListener('pagehide', sichernBeiAbschied);
      window.removeEventListener('beforeunload', sichernBeiAbschied);
      window.removeEventListener('blur', sichernBeiAbschied);
      document.removeEventListener('visibilitychange', sichernWennVerborgen);
      if (beobachter) beobachter.disconnect();
      alleLeinwaende.delete(L);
      host.classList.remove('leinwand');
      host.innerHTML = '';
    };
    L.seiten = () => seiten;
    L.inhalt = inhalt;
    L.zustand = () => {
      const r = auswahlRahmen();
      messeHost();
      const ecke = r ? zuSchirm(r.x2, r.y2) : null;
      return {
        aktion: aktion && aktion.art, auswahl: auswahl.size, lasso: lassoPunkte ? lassoPunkte.length : 0, editiert: !!editiert, werkzeug: einst.werkzeug,
        breite: r ? Math.round((r.x2 - r.x1) * ansicht.s) : 0, ecke: ecke ? [hostRect.left + ecke[0], hostRect.top + ecke[1]] : null, zoom: ansicht.s
      };
    };

    groesse();
    return L;
  }

  Leinwand.TINTE = TINTE;
  Leinwand.FARBNAMEN = FARBNAMEN;
  Leinwand.MARKER = MARKER;
  Leinwand.MARKERNAMEN = MARKERNAMEN;
  Leinwand.NOTIZ_KOPF = NOTIZ_KOPF;
  Leinwand.sicht = sicht;
  Leinwand.notizTitel = notizTitel;
  Leinwand.farbeVon = farbeVon;
  Leinwand.istHex = istHex;
  Leinwand.NOTIZFARBEN = NOTIZFARBEN;
  Leinwand.NOTIZNAMEN = NOTIZNAMEN;
  Leinwand.PAPIER = PAPIER;
  // Seitenfarbe eines Notizbuchs oder Whiteboards (weiss, dunkelgrau, dunkelblau; sonst wie das Design):
  // { farbe: Papierfarbe oder undefined, flaeche: 'hell' | 'dunkel' oder undefined = nach Design }
  const SEITENFARBEN = { weiss: { farbe: '#ffffff', flaeche: 'hell' }, dunkelgrau: { farbe: '#2b2d31', flaeche: 'dunkel' }, dunkelblau: { farbe: '#172139', flaeche: 'dunkel' } };
  Leinwand.seitenfarbe = name => SEITENFARBEN[name] || {};
  Leinwand.LINIEN = LINIEN;
  Leinwand.FORMATE = FORMATE;
  Leinwand.breite = breite;
  Leinwand.stiftZuletzt = () => stiftZuletzt;
  // Fläche eines Stiftstrichs für andere Zeichner (PDF-Export): kreis(x, y, r) und vieleck([[x, y], …]) in Einheiten der Seite
  Leinwand.strichFlaeche = (s, z) => fuelleStrich(null, strichProben(s, 0, s.p.length - 1), z.kreis, z.vieleck);
  Leinwand.stiftDaten = stiftDaten;
  Leinwand.neigungWinkel = neigungWinkel;
  Leinwand.druckAbbildung = druckAbbildung;
  Leinwand.neigungAlpha = neigungAlpha;
  Leinwand.DRUCK_STUFEN = DRUCK_STUFEN;
  Leinwand.grenzen = grenzen;
  Leinwand.flaecheFuer = flaecheFuer;
  Leinwand.flaecheThema = flaecheThema;
  Leinwand.tintenFarbe = tintenFarbe;
  Leinwand.vorschau = vorschau;
  Leinwand.malBild = malBild;
  Leinwand.bilderBereit = bilderBereit;
  Leinwand.istBild = istBild;
  Leinwand.istText = istText;
  Leinwand.GESTEN_STANDARD = GESTEN_STANDARD;
  Leinwand.GESTEN_AKTIONEN = GESTEN_AKTIONEN;
  Leinwand.STIFTARTEN = STIFTARTEN;
  Leinwand.stiftDicke = stiftDicke;
  Leinwand.drehungVon = drehungVon;
  Leinwand.seitenFormat = seitenFormat;
  Leinwand.pdfAnsicht = pdfAnsicht;
  Leinwand.textLayout = textLayout;
  Leinwand.TEXT_SCHRIFT = TEXT_SCHRIFT;
  Leinwand.MM = MM;
  Leinwand.einheit = einheit;
  Leinwand.GLAETTUNG = Object.keys(GLAETTUNG);
  Leinwand.zeilen = zeilen;
  window.Leinwand = Leinwand;
})();
