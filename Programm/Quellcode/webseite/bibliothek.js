'use strict';
// Bibliothek: Ordner, Skripte (PDFs) und Notizbücher. Jedes Element ist ein eigener Eintrag "bib:<id>".
Daten.bereit.then(function () {
  const { $, esc, neueId, oeffneDialog, warteDialog, warteText, schliesseDialog, knoepfe, frageName, bestaetige, meldung } = UI;
  const FARBEN = { blau: 'Blau', rot: 'Rot', gruen: 'Grün', gelb: 'Gelb', lila: 'Lila', grau: 'Grau' };
  const MODI = { original: 'Original', hell: 'Weisser Hintergrund', dunkelgrau: 'Dunkelgrauer Hintergrund', dunkel: 'Dunkelblauer Hintergrund' };
  const PAPIERE = { karo: 'Kariert', karofein: 'Kariert fein', linien: 'Liniert', punkte: 'Punktraster', blanko: 'Blanko' };
  // Farbe der Seiten eines Notizbuchs oder Whiteboards; "auto" folgt dem Design (hell oder dunkel)
  const SEITENFARBEN = { auto: 'Wie das Design', weiss: 'Weiss', dunkelgrau: 'Dunkelgrau', dunkelblau: 'Dunkelblau' };
  const SF_HEX = { auto: 'var(--blatt)', weiss: '#ffffff', dunkelgrau: '#2b2d31', dunkelblau: '#172139' };
  const MAX_CLOUD = 20 * 1024 * 1024;

  /* ---------- Daten ---------- */

  const get = id => { const v = Daten.get('bib:' + id); return v ? Object.assign({ id }, v) : null; };
  const alle = () => Daten.keys('bib:').map(k => Object.assign({ id: k.slice(4) }, Daten.get(k)));
  function speichere(id, it) {
    const { id: _, ...rest } = it;
    Daten.set('bib:' + id, rest);
  }
  function aendere(id, fn) {
    const it = get(id);
    if (!it) return;
    fn(it);
    speichere(id, it);
  }
  // Ein Whiteboard ist ein Notizbuch mit genau einer unendlichen Fläche (papier: 'whiteboard', raster: Punkte, Karo, …)
  const istBrett = it => !!it && it.art === 'notizbuch' && it.papier === 'whiteboard';
  const RASTER = { punkte: 'Punktraster', karo: 'Kariert', linien: 'Liniert', blanko: 'Leer' };
  const ordnerListe = () => alle().filter(i => i.art === 'ordner');
  const dokumente = () => alle().filter(i => i.art === 'skript' || i.art === 'notizbuch');
  const kinderOrdner = id => ordnerListe().filter(o => (o.eltern || null) === (id || null));
  const dokumenteIn = id => dokumente().filter(d => (d.eltern || null) === (id || null));
  function pfadVon(id) {
    const p = [];
    const gesehen = new Set();
    for (let o = id ? get(id) : null; o && !gesehen.has(o.id); o = o.eltern ? get(o.eltern) : null) { gesehen.add(o.id); p.unshift(o); }
    return p;
  }
  const pfadNamen = id => pfadVon(id).map(o => o.name);
  const pfadText = id => pfadNamen(id).join(' / ') || 'Bibliothek';
  function nachfahren(id) {
    const r = [id];
    for (let i = 0; i < r.length; i++) kinderOrdner(r[i]).forEach(k => r.push(k.id));
    return r;
  }
  function inhaltText(id) {
    const o = nachfahren(id);
    const ds = dokumente().filter(d => o.includes(d.eltern));
    const u = kinderOrdner(id).length;
    const s = ds.filter(d => d.art === 'skript').length, n = ds.length - s;
    const teile = [];
    if (u) teile.push(`${u} Ordner`);
    if (s || !n) teile.push(`${s} ${s === 1 ? 'Skript' : 'Skripte'}`);
    if (n) teile.push(`${n} ${n === 1 ? 'Notizbuch' : 'Notizbücher'}`);
    return teile.join(' · ');
  }

  /* ---------- Vorschaubilder ---------- */

  const vorschauCache = new Map();
  const ordnerSymbol = farbe => `<svg class="ordner-symbol" style="--farbe: var(--s-${FARBEN[farbe] ? farbe : 'blau'})" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>`;

  function vorschauHtml(d, mini) {
    if (istBrett(d)) {
      return `<span class="vorschau brett-vorschau${mini ? ' mini' : ''}" style="--farbe: var(--s-${FARBEN[d.farbe] ? d.farbe : 'blau'})"><canvas data-nb="${d.id}" width="${mini ? 88 : 320}" height="${mini ? 66 : 240}"></canvas></span>`;
    }
    if (d.art === 'notizbuch') {
      return `<span class="vorschau nb-vorschau${mini ? ' mini' : ''}" style="--farbe: var(--s-${FARBEN[d.farbe] ? d.farbe : 'blau'})"><canvas data-nb="${d.id}" width="${mini ? 88 : 240}" height="${mini ? 124 : 340}"></canvas></span>`;
    }
    const inv = PdfDienst.umfaerbenNoetig(d.modus, d.hell);
    return `<span class="vorschau modus-${d.modus || 'original'}${mini ? ' mini' : ''}"><img data-vorschau="${esc(d.datei)}" alt="" class="${inv ? (d.modus === 'dunkel' || d.modus === 'dunkelgrau' ? 'dunkelblau' : 'invertiert') : ''}"></span>`;
  }

  async function fuelleVorschau(wurzel) {
    for (const cv of wurzel.querySelectorAll('canvas[data-nb]')) {
      const it = get(cv.dataset.nb);
      if (!it) continue;
      const sid = (it.seiten || [])[0];
      const F = Leinwand.seitenFormat(it, sid);
      // Whiteboard: alles Geschriebene im Bild, ohne Blattgrenzen
      if (istBrett(it)) { Leinwand.vorschau(cv, sid ? Daten.get('ink:' + it.id + ':' + sid) : null, { flaeche: Leinwand.seitenfarbe(it.seitenfarbe).flaeche, papierFarbe: Leinwand.seitenfarbe(it.seitenfarbe).farbe }); continue; }
      const sf = Leinwand.seitenfarbe(it.seitenfarbe);
      Leinwand.vorschau(cv, sid ? Daten.get('ink:' + it.id + ':' + sid) : null, { b: F.b, h: F.h, mm: F.mm, papier: it.papier, flaeche: sf.flaeche, papierFarbe: sf.farbe });
    }
    for (const img of wurzel.querySelectorAll('img[data-vorschau]')) {
      const d = img.dataset.vorschau;
      if (!vorschauCache.has(d)) {
        let src = '';
        try { const b = await Daten.datei.get('vorschau:' + d); if (b) src = await b.text(); } catch (e) { /* ohne Bild */ }
        if (src) vorschauCache.set(d, src);
        else { img.closest('.vorschau').classList.add('ohne'); vorschauErzeugen(d); continue; }
      }
      img.src = vorschauCache.get(d);
    }
  }

  // PDFs, die im Explorer in die Bibliothek gelegt wurden, haben noch kein Vorschaubild
  const inArbeit = new Set();
  let vorschauKette = Promise.resolve();
  function vorschauErzeugen(datei) {
    if (inArbeit.has(datei)) return;
    inArbeit.add(datei);
    vorschauKette = vorschauKette.then(async () => {
      try {
        const blob = await Daten.datei.get('pdf:' + datei);
        if (!blob) return;
        const pdf = await PdfDienst.oeffnePdf(new Uint8Array(await blob.arrayBuffer()));
        const v = await PdfDienst.vorschauErstellen(pdf);
        const seiten = pdf.numPages;
        pdf.destroy();
        await Daten.datei.put('vorschau:' + datei, new Blob([v.bild], { type: 'text/plain' }));
        vorschauCache.set(datei, v.bild);
        const it = get(datei);
        if (it && it.art === 'skript' && (it.hell == null || !it.seiten)) aendere(datei, x => { if (x.hell == null) x.hell = v.hell; x.seiten = seiten; });
        document.querySelectorAll(`img[data-vorschau="${datei}"]`).forEach(img => { img.src = v.bild; img.closest('.vorschau').classList.remove('ohne'); });
      } catch (e) { /* kein Bild */ }
    });
  }

  /* ---------- Ansicht ---------- */

  let aktuell = null;
  let reiter = Daten.get('lokal:bib-reiter', 'alle');
  const inhalt = $('skripte-inhalt');

  function sortiere(liste, art) {
    const kopie = liste.slice();
    const name = (a, b) => a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' });
    if (art === 'neu') kopie.sort((a, b) => (b.erstellt || 0) - (a.erstellt || 0) || name(a, b));
    else if (art === 'geoeffnet') kopie.sort((a, b) => (b.geoeffnet || 0) - (a.geoeffnet || 0) || name(a, b));
    else kopie.sort(name);
    return kopie;
  }

  function dokInfo(d, mitOrt) {
    const teile = [];
    if (mitOrt) teile.push(esc(pfadText(d.eltern)));
    if (d.art === 'skript') teile.push(`${d.seiten || '?'} ${d.seiten === 1 ? 'Seite' : 'Seiten'}${d.seite > 1 ? ` · bei S. ${d.seite}` : ''}`);
    else if (istBrett(d)) teile.push('Unendliche Fläche');
    else teile.push(`${(d.seiten || []).length} ${(d.seiten || []).length === 1 ? 'Seite' : 'Seiten'} · ${d.format || 'A4'}${d.quer ? ' quer' : ''}`);
    const z = Zeit.dokZeit(d.id).sekunden;
    if (z >= 60 && Zeit.sichtbar()) teile.push('⏱ ' + Zeit.text(z));
    return teile.join(' · ');
  }

  // Datum unter einem Dokument: "8. Okt. 2026 um 00:45"
  function datumText(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' }) + ' um ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  const TITEL = { alle: 'Dokumente', favorit: 'Favoriten', skript: 'Skripte', notizbuch: 'Notizbücher', whiteboard: 'Whiteboards', papierkorb: 'Papierkorb' };
  const STERN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>';
  const PFEIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>';
  // Name mit Pfeil darunter: öffnet das Menü des Ordners oder Dokuments
  const titelKnopf = (art, id, name) => `<button class="karte-titel" type="button" data-mehr="${art}" data-id="${id}" aria-label="Optionen für ${esc(name)}" title="${esc(name)}"><span class="karte-name">${esc(name)}</span>${PFEIL}</button>`;
  const artKlasse = d => (istBrett(d) ? 'brett' : d.art === 'skript' ? 'skript' : 'notizbuch');
  const nurBib = sel => $('ansicht-bibliothek').querySelectorAll(sel);

  function zeigeOrdner(id) {
    if (id && !get(id)) { location.hash = '#/bibliothek'; return; }
    aktuell = id || null;
    schliesseKontext();

    // Papierkorb: eigene Liste statt Karten
    if (reiter === 'papierkorb' && !papierkorbDa()) reiter = 'alle';
    $('ansicht-bibliothek').classList.toggle('im-papierkorb', reiter === 'papierkorb');
    nurBib('[data-reiter]').forEach(k => k.setAttribute('aria-selected', String(k.dataset.reiter === reiter)));

    const q = $('suche').value.trim().toLowerCase();
    const imOrdner = reiter === 'alle' && !q && aktuell;
    // Titel: Ansicht oder Ordner; im Ordner steht der Weg dorthin klein darüber (auch Ablageziel beim Ziehen)
    $('bib-titel').textContent = q && reiter !== 'papierkorb' ? 'Suche' : imOrdner ? get(aktuell).name : TITEL[reiter] || 'Dokumente';
    const pfad = imOrdner ? pfadVon(aktuell).slice(0, -1) : [];
    $('pfad').hidden = !imOrdner;
    $('pfad').innerHTML = imOrdner ? [`<a href="#/bibliothek" data-ziel="">Dokumente</a>`]
      .concat(pfad.map(o => `<a href="#/bibliothek/${o.id}" data-ziel="${o.id}">${esc(o.name)}</a>`))
      .join('<span class="pfad-trenner" aria-hidden="true">›</span>') : '';
    if (reiter === 'papierkorb') { zeigePapierkorb(); zeigeSpeicher(); return; }

    const art = $('sortierung').value;
    const flach = q || reiter !== 'alle';
    let os = [], ds = [];
    if (flach) {
      ds = dokumente();
      if (reiter === 'skript') ds = ds.filter(d => d.art === 'skript');
      else if (reiter === 'notizbuch') ds = ds.filter(d => d.art === 'notizbuch' && !istBrett(d));
      else if (reiter === 'whiteboard') ds = ds.filter(istBrett);
      if (reiter === 'favorit') ds = ds.filter(d => d.favorit);
      if (q) { ds = ds.filter(d => d.name.toLowerCase().includes(q)); if (reiter === 'alle') os = ordnerListe().filter(o => o.name.toLowerCase().includes(q)); }
    } else {
      os = kinderOrdner(aktuell);
      ds = dokumenteIn(aktuell);
    }
    os = sortiere(os, art === 'name' ? 'name' : 'neu');
    ds = sortiere(ds, art);

    if (!os.length && !ds.length) {
      const leerText = q ? '<strong>Nichts gefunden.</strong> Kein Ordner, kein Skript und kein Notizbuch heisst so.'
        : reiter === 'favorit' ? '<strong>Noch keine Favoriten.</strong> Tippe bei einem Skript oder Notizbuch auf den Stern.'
          : reiter === 'notizbuch' ? '<strong>Noch keine Notizbücher.</strong> Mit „Neu“ legst du eins an, in A4 oder A3.'
            : reiter === 'whiteboard' ? '<strong>Noch keine Whiteboards.</strong> Mit „Neu“ legst du eine unendliche Fläche an.'
            : reiter === 'skript' ? '<strong>Noch keine Skripte.</strong> Ziehe PDFs hierher oder tippe auf „Neu“.'
              : `<strong>${aktuell ? 'Dieser Ordner ist leer.' : 'Noch nichts hier.'}</strong> Ziehe PDFs hierher oder tippe auf „Neu“ für ein Skript oder Notizbuch.`;
      inhalt.innerHTML = `<div class="leer ablage">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M13 12v6M10 15h6"/></svg>
          <p>${leerText}</p>
        </div>`;
    } else {
      // Ein Raster wie ein Regal: Ordner zuerst, dann Skripte, Notizbücher und Whiteboards als Cover, unten bündig
      const datumVon = d => (art === 'neu' ? d.erstellt : d.geoeffnet || d.erstellt);
      inhalt.innerHTML = `<div class="bib-raster">${os.map(o => `
          <div class="karte ordner-karte" data-ordner="${o.id}" draggable="true">
            <div class="cover-platz"><div class="cover-huelle ordner"><a href="#/bibliothek/${o.id}" class="karte-link cover" aria-label="${esc(o.name)} öffnen">${ordnerSymbol(o.farbe)}</a></div></div>
            <div class="karte-unten">${titelKnopf('ordner', o.id, o.name)}<span class="karte-datum">${flach ? esc(pfadText(o.eltern)) : inhaltText(o.id)}</span></div>
          </div>`).join('')}${ds.map(d => `
          <div class="karte datei-karte" data-datei="${d.id}" draggable="true" title="${dokInfo(d, true)}">
            <div class="cover-platz"><div class="cover-huelle ${artKlasse(d)}">
              <a href="#/dok/${d.id}" class="karte-link cover" aria-label="${esc(d.name)} öffnen">${vorschauHtml(d)}</a>
              <button class="karte-stern" type="button" data-stern="${d.id}" aria-pressed="${!!d.favorit}" aria-label="Favorit" title="${d.favorit ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}">${STERN}</button>
            </div></div>
            <div class="karte-unten">${titelKnopf('datei', d.id, d.name)}<span class="karte-datum">${esc(datumText(datumVon(d)))}</span></div>
          </div>`).join('')}</div>`;
      fuelleVorschau(inhalt);
    }
    zeigeSpeicher();
  }

  async function zeigeSpeicher() {
    const ds = dokumente();
    const s = ds.filter(d => d.art === 'skript').length;
    let text = `${s} ${s === 1 ? 'Skript' : 'Skripte'}, ${ds.length - s} ${ds.length - s === 1 ? 'Notizbuch' : 'Notizbücher'}, ${ordnerListe().length} Ordner. `;
    const B = window.lernheftDesktop;
    text += B ? (B.speicherText ? B.speicherText() : `Alles liegt im Ordner ${B.wurzel}\\Bibliothek.`) : 'Gespeichert nur in diesem Browser.';
    $('speicher-info').textContent = text;
  }

  $('suche').addEventListener('input', () => zeigeOrdner(aktuell));
  $('sortierung').addEventListener('change', () => { Daten.set('lokal:bib-sortierung', $('sortierung').value); zeigeOrdner(aktuell); });
  const gemerkteSortierung = Daten.get('lokal:bib-sortierung', null);
  if (gemerkteSortierung && [...$('sortierung').options].some(o => o.value === gemerkteSortierung)) $('sortierung').value = gemerkteSortierung;
  nurBib('[data-reiter]').forEach(k => k.addEventListener('click', () => {
    reiter = k.dataset.reiter;
    Daten.set('lokal:bib-reiter', reiter);
    // "Dokumente" führt zurück an den Anfang der Bibliothek
    if (reiter === 'alle' && aktuell) { location.hash = '#/bibliothek'; return; }
    zeigeOrdner(aktuell);
  }));
  // Suche oben rechts: das Feld klappt beim Antippen der Lupe auf und bei leerem Feld wieder zu
  const suchFeld = $('suche'), suchKnopf = $('bib-such-knopf');
  function sucheOffen(an) {
    $('ansicht-bibliothek').classList.toggle('suche-offen', an);
    suchKnopf.setAttribute('aria-expanded', String(an));
    if (an) { suchFeld.focus(); return; }
    suchFeld.value = '';
    zeigeOrdner(aktuell);
  }
  suchKnopf.addEventListener('click', () => sucheOffen(!$('ansicht-bibliothek').classList.contains('suche-offen')));
  suchFeld.addEventListener('blur', () => { if (!suchFeld.value.trim()) setTimeout(() => { if (document.activeElement !== suchFeld && !suchFeld.value.trim()) sucheOffen(false); }, 150); });
  suchFeld.addEventListener('keydown', e => { if (e.key === 'Escape') { suchFeld.value = ''; sucheOffen(false); } });
  $('bib-einst-knopf').addEventListener('click', () => { const k = $('menue-einstellungen'); if (k) k.click(); });

  /* ---------- Neu: Ordner, Skript, Notizbuch ---------- */

  $('neuer-ordner').addEventListener('click', async () => {
    const name = await frageName('Neuer Ordner', '', 'Anlegen');
    if (!name) return;
    const eltern = aktuell ? get(aktuell) : null;
    speichere(neueId(), { art: 'ordner', name, eltern: aktuell, farbe: eltern ? eltern.farbe : 'blau', erstellt: Date.now() });
    zeigeOrdner(aktuell);
  });

  // "+ Neu": kleines Menü wie beim Namen eines Dokuments
  $('neu-knopf').addEventListener('click', e => {
    e.stopPropagation();
    const offen = kontextEl && kontextEl.dataset.fuer === 'neu';
    schliesseKontext();
    if (offen) return;
    const knopf = e.currentTarget, el = document.createElement('div');
    el.className = 'kontext neu-menue';
    el.dataset.fuer = 'neu';
    el.setAttribute('role', 'menu');
    el.innerHTML = `
      <button type="button" role="menuitem" data-neu="notizbuch">Notizbuch</button>
      <button type="button" role="menuitem" data-neu="skript">Skript (PDF importieren)</button>
      <button type="button" role="menuitem" data-neu="whiteboard">Whiteboard</button>
      <button type="button" role="menuitem" data-neu="ordner">Ordner</button>`;
    document.body.appendChild(el);
    const r = knopf.getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(r.right - el.offsetWidth, window.innerWidth - el.offsetWidth - 8)) + 'px';
    el.style.top = (r.bottom + 6) + 'px';
    kontextEl = el;
    knopf.setAttribute('aria-expanded', 'true');
    el.addEventListener('click', ev => {
      const k = ev.target.closest('[data-neu]');
      if (!k) return;
      schliesseKontext();
      if (k.dataset.neu === 'ordner') $('neuer-ordner').click(); else neuDialog(k.dataset.neu);
    });
    el.querySelector('button').focus({ preventScroll: true });
  });

  async function neuDialog(vorwahl) {
    const wahl = vorwahl || await oeffneDialog(`<div class="dialog-form breit">
        <h2>Was möchtest du anlegen?</h2>
        <div class="neu-wahl">
          <button type="button" class="neu-karte" data-wahl="notizbuch">
            <span class="neu-bild nb" aria-hidden="true"><span></span></span>
            <strong>Notizbuch</strong>
            <span>Leere Seiten in A4 oder A3, kariert, liniert, gepunktet oder blanko. Wird in der Cloud gespeichert.</span>
          </button>
          <button type="button" class="neu-karte" data-wahl="skript">
            <span class="neu-bild pdf" aria-hidden="true">PDF</span>
            <strong>Skript</strong>
            <span>Eine PDF importieren und direkt darauf schreiben, markieren und Haftnotizen kleben.</span>
          </button>
          <button type="button" class="neu-karte" data-wahl="whiteboard">
            <span class="neu-bild brett" aria-hidden="true"></span>
            <strong>Whiteboard</strong>
            <span>Eine unendliche Fläche zum Zoomen und Verschieben. Lässt sich in Seiten umwandeln und umgekehrt.</span>
          </button>
        </div>
        <div class="dialog-knoepfe"><button type="button" class="btn-leise" data-abbrechen>Abbrechen</button></div>
      </div>`);
    if (wahl === 'skript') $('pdf-datei').click();
    else if (wahl === 'notizbuch') neuesNotizbuch();
    else if (wahl === 'whiteboard') neuesWhiteboard();
  }

  async function neuesWhiteboard() {
    const heute = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
    const r = await oeffneDialog(`<form class="dialog-form breit">
        <h2>Neues Whiteboard</h2>
        <label class="feld"><span>Name</span><input name="name" value="Whiteboard ${esc(heute)}" required maxlength="120" autofocus autocomplete="off"></label>
        <fieldset class="wahl-reihe"><legend>Raster</legend>
          ${Object.entries(RASTER).map(([p, n], i) => `<label class="wahl-karte"><input type="radio" name="raster" value="${p}" ${i === 0 ? 'checked' : ''}><span class="papier-bild ${p}"></span><span>${n}</span></label>`).join('')}
        </fieldset>
        <fieldset class="wahl-reihe farben"><legend>Farbe</legend>
          ${Object.entries(FARBEN).map(([f, n], i) => `<label class="farb-wahl" title="${n}"><input type="radio" name="farbe" value="${f}" ${i === 0 ? 'checked' : ''}><span style="--farbe: var(--s-${f})"></span></label>`).join('')}
        </fieldset>
        <p class="dialog-klein">Ort: <strong>${esc(pfadText(aktuell))}</strong>. Die Fläche hat keine Grenzen: mit zwei Fingern (oder Strg + Mausrad) zoomen, mit der Hand oder einem Finger verschieben.</p>
        ${knoepfe('Anlegen')}
      </form>`, {
      wert: d => ({
        name: d.querySelector('[name="name"]').value.trim() || 'Whiteboard',
        raster: d.querySelector('[name="raster"]:checked').value,
        farbe: d.querySelector('[name="farbe"]:checked').value
      })
    });
    if (!r) return;
    const id = neueId();
    speichere(id, { art: 'notizbuch', papier: 'whiteboard', raster: r.raster, name: r.name, eltern: aktuell, format: 'A4', farbe: r.farbe, seiten: [neueId()], erstellt: Date.now(), geoeffnet: Date.now(), seite: 1, favorit: false });
    location.hash = '#/dok/' + id;
  }

  async function neuesNotizbuch() {
    const heute = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
    const r = await oeffneDialog(`<form class="dialog-form breit">
        <h2>Neues Notizbuch</h2>
        <label class="feld"><span>Name</span><input name="name" value="Notizbuch ${esc(heute)}" required maxlength="120" autofocus autocomplete="off"></label>
        <fieldset class="wahl-reihe"><legend>Format</legend>
          <label class="wahl-karte"><input type="radio" name="format" value="A4" checked><span class="format-bild a4"></span><span>A4</span></label>
          <label class="wahl-karte"><input type="radio" name="format" value="A3"><span class="format-bild a3"></span><span>A3</span></label>
        </fieldset>
        <fieldset class="wahl-reihe"><legend>Ausrichtung</legend>
          <label class="wahl-karte"><input type="radio" name="quer" value="hoch" checked><span class="format-bild a4"></span><span>Hochformat</span></label>
          <label class="wahl-karte"><input type="radio" name="quer" value="quer"><span class="format-bild a4 quer"></span><span>Querformat</span></label>
        </fieldset>
        <fieldset class="wahl-reihe"><legend>Papier</legend>
          ${Object.entries(PAPIERE).map(([p, n], i) => `<label class="wahl-karte"><input type="radio" name="papier" value="${p}" ${i === 0 ? 'checked' : ''}><span class="papier-bild ${p}"></span><span>${n}</span></label>`).join('')}
        </fieldset>
        <fieldset class="wahl-reihe"><legend>Seitenfarbe</legend>
          ${Object.entries(SEITENFARBEN).map(([f, n], i) => `<label class="wahl-karte"><input type="radio" name="sfarbe" value="${f}" ${i === 0 ? 'checked' : ''}><span class="farb-muster" style="--c: ${SF_HEX[f]}"></span><span>${n}</span></label>`).join('')}
        </fieldset>
        <fieldset class="wahl-reihe farben"><legend>Farbe des Covers</legend>
          ${Object.entries(FARBEN).map(([f, n], i) => `<label class="farb-wahl" title="${n}"><input type="radio" name="farbe" value="${f}" ${i === 0 ? 'checked' : ''}><span style="--farbe: var(--s-${f})"></span></label>`).join('')}
        </fieldset>
        <p class="dialog-klein">Ort: <strong>${esc(pfadText(aktuell))}</strong></p>
        ${knoepfe('Anlegen')}
      </form>`, {
      wert: d => ({
        name: d.querySelector('[name="name"]').value.trim() || 'Notizbuch',
        format: d.querySelector('[name="format"]:checked').value,
        quer: d.querySelector('[name="quer"]:checked').value === 'quer',
        papier: d.querySelector('[name="papier"]:checked').value,
        farbe: d.querySelector('[name="farbe"]:checked').value,
        sfarbe: d.querySelector('[name="sfarbe"]:checked').value
      })
    });
    if (!r) return;
    const id = neueId();
    speichere(id, { art: 'notizbuch', name: r.name, eltern: aktuell, format: r.format, ...(r.quer ? { quer: true } : {}), papier: r.papier, farbe: r.farbe, ...(r.sfarbe !== 'auto' ? { seitenfarbe: r.sfarbe } : {}), seiten: [neueId()], erstellt: Date.now(), geoeffnet: Date.now(), seite: 1, favorit: false });
    location.hash = '#/dok/' + id;
  }

  $('pdf-datei').addEventListener('change', e => {
    const dateien = [...e.target.files];
    e.target.value = '';
    hinzufuegen(dateien);
  });

  async function hinzufuegen(dateien) {
    dateien = dateien.filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (!dateien.length) { meldung('Bitte wähle PDF-Dateien aus.'); return; }
    warteDialog(dateien.length === 1 ? 'PDF wird gelesen …' : `${dateien.length} PDFs werden gelesen …`);
    try { await PdfDienst.ladePdfJs(); } catch (e) { schliesseDialog(); meldung(e.message); return; }

    const gelesen = [], kaputt = [];
    for (const f of dateien) {
      try {
        const pdf = await PdfDienst.oeffnePdf(new Uint8Array(await f.arrayBuffer()));
        gelesen.push({ f, seiten: pdf.numPages, ...(await PdfDienst.vorschauErstellen(pdf)) });
        pdf.destroy();
      } catch (e) { kaputt.push(f.name); }
    }
    if (!gelesen.length) { schliesseDialog(); meldung('Diese Datei konnte nicht als PDF gelesen werden.'); return; }

    const erste = gelesen[0];
    let standard = Daten.get('lokal:pdf-modus', 'original');
    if (!MODI[standard]) standard = 'original';
    const gross = gelesen.filter(g => g.f.size > MAX_CLOUD).map(g => g.f.name);
    const modus = await oeffneDialog(`<form class="dialog-form breit">
        <h2>${gelesen.length === 1 ? 'Skript hinzufügen' : `${gelesen.length} Skripte hinzufügen`}</h2>
        <p class="dialog-klein">${gelesen.map(g => esc(g.f.name)).join(', ')} · nach <strong>${esc(pfadText(aktuell))}</strong></p>
        ${kaputt.length ? `<p class="dialog-warnung">Nicht lesbar und übersprungen: ${kaputt.map(esc).join(', ')}</p>` : ''}
        ${gross.length ? `<p class="dialog-warnung">Grösser als 20 MB, bleibt nur auf diesem Gerät (Notizen werden trotzdem synchronisiert): ${gross.map(esc).join(', ')}</p>` : ''}
        <fieldset class="modus-wahl">
          <legend>Darstellung beim Lesen</legend>
          ${Object.entries(MODI).map(([m, name]) => {
            const inv = PdfDienst.umfaerbenNoetig(m, erste.hell);
            return `<label class="modus-karte">
              <input type="radio" name="modus" value="${m}" ${m === standard ? 'checked' : ''}>
              <span class="vorschau modus-${m}"><img src="${erste.bild}" alt="" class="${inv ? (m === 'dunkel' || m === 'dunkelgrau' ? 'dunkelblau' : 'invertiert') : ''}"></span>
              <span class="modus-name">${name}</span>
            </label>`;
          }).join('')}
        </fieldset>
        <p class="dialog-klein">Umgefärbt werden nur Seiten, die nicht zur Wahl passen. Du kannst das beim Lesen jederzeit ändern.</p>
        ${knoepfe('Hinzufügen')}
      </form>`, { wert: d => d.querySelector('input[name="modus"]:checked').value });
    if (!modus) return;
    Daten.set('lokal:pdf-modus', modus);

    warteDialog('Wird gespeichert …');
    let letzte = null;
    try {
      for (const g of gelesen) {
        const id = neueId();
        await Daten.datei.put('pdf:' + id, new Blob([g.f], { type: 'application/pdf' }));
        await Daten.datei.put('vorschau:' + id, new Blob([g.bild], { type: 'text/plain' }));
        vorschauCache.set(id, g.bild);
        speichere(id, {
          art: 'skript', name: g.f.name.replace(/\.pdf$/i, ''), eltern: aktuell, datei: id, seiten: g.seiten, groesse: g.f.size,
          modus, hell: g.hell, erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false
        });
        // Jetzt, wo das Skript existiert, kann die Datei in die Cloud
        if (Daten.dateiNeu) { Daten.dateiNeu('pdf:' + id); Daten.dateiNeu('vorschau:' + id); }
        letzte = id;
      }
      schliesseDialog();
      meldung(gelesen.length === 1 ? 'Skript hinzugefügt' : `${gelesen.length} Skripte hinzugefügt`, gelesen.length === 1 ? { text: 'Öffnen', fn: () => { location.hash = '#/dok/' + letzte; } } : null);
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* optional */ }
    } catch (e) {
      schliesseDialog();
      meldung('Speichern fehlgeschlagen. Vielleicht ist der Speicher voll.');
    }
    zeigeOrdner(aktuell);
  }

  /* ---------- Ziehen: PDFs vom Computer und Karten in Ordner ---------- */

  const ansicht = $('ansicht-bibliothek');
  let gezogen = null;
  ansicht.addEventListener('dragstart', e => {
    const k = e.target.closest('[data-datei], [data-ordner]');
    if (!k) return;
    gezogen = { id: k.dataset.datei || k.dataset.ordner, ordner: !!k.dataset.ordner };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', gezogen.id);
    k.classList.add('wird-gezogen');
  });
  ansicht.addEventListener('dragend', () => {
    gezogen = null;
    ansicht.querySelectorAll('.wird-gezogen, .ziel').forEach(el => el.classList.remove('wird-gezogen', 'ziel'));
    ansicht.classList.remove('ablegen');
  });
  function zielVon(e) {
    const el = e.target.closest('.ordner-karte, #pfad [data-ziel]');
    if (!el) return null;
    return { el, id: (el.dataset.ordner || el.dataset.ziel) || null };
  }
  const darfRein = ziel => gezogen && !(gezogen.ordner && nachfahren(gezogen.id).includes(ziel.id));
  ansicht.addEventListener('dragover', e => {
    const vonAussen = e.dataTransfer.types.includes('Files');
    const ziel = zielVon(e);
    ansicht.querySelectorAll('.ziel').forEach(el => el.classList.remove('ziel'));
    if (vonAussen) { e.preventDefault(); ansicht.classList.add('ablegen'); return; }
    if (ziel && darfRein(ziel)) { e.preventDefault(); ziel.el.classList.add('ziel'); }
  });
  ansicht.addEventListener('dragleave', e => { if (!ansicht.contains(e.relatedTarget)) ansicht.classList.remove('ablegen'); });
  ansicht.addEventListener('drop', e => {
    ansicht.classList.remove('ablegen');
    if (e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); hinzufuegen([...e.dataTransfer.files]); return; }
    const ziel = zielVon(e);
    if (!ziel || !darfRein(ziel)) return;
    e.preventDefault();
    verschiebe(gezogen.id, ziel.id);
  });

  function verschiebe(id, zielId) {
    aendere(id, it => { it.eltern = zielId; });
    zeigeOrdner(aktuell);
    meldung(`Verschoben nach ${zielId ? get(zielId).name : 'Bibliothek'}`);
  }

  function waehleZielordner(titel, gesperrt, jetzt) {
    const zeilen = [];
    const zeile = (id, name, tiefe, farbe) => {
      const aus = gesperrt.includes(id);
      zeilen.push(`<label class="baum-zeile${aus ? ' aus' : ''}" style="--tiefe: ${tiefe}">
          <input type="radio" name="ziel" value="${id || ''}" ${aus ? 'disabled' : ''} ${(id || null) === (jetzt || null) ? 'checked' : ''}>
          ${ordnerSymbol(farbe)}<span>${esc(name)}</span>
        </label>`);
    };
    zeile(null, 'Bibliothek', 0, 'grau');
    const geh = (id, tiefe) => sortiere(kinderOrdner(id), 'name').forEach(o => {
      zeile(o.id, o.name, tiefe, o.farbe);
      if (!gesperrt.includes(o.id)) geh(o.id, tiefe + 1);
    });
    geh(null, 1);
    return oeffneDialog(`<form class="dialog-form">
        <h2>${esc(titel)}</h2>
        <div class="baum">${zeilen.join('')}</div>
        ${knoepfe('Hierhin verschieben')}
      </form>`, { wert: d => { const r = d.querySelector('input[name="ziel"]:checked'); return r ? { ziel: r.value || null } : null; } });
  }

  /* ---------- Kontextmenü ---------- */

  let kontextEl = null;
  function schliesseKontext() { if (kontextEl) { kontextEl.remove(); kontextEl = null; } }

  inhalt.addEventListener('click', e => {
    const stern = e.target.closest('[data-stern]');
    if (stern) {
      let an = false;
      aendere(stern.dataset.stern, it => { it.favorit = an = !it.favorit; });
      stern.setAttribute('aria-pressed', String(an));
      meldung(an ? 'Als Favorit markiert' : 'Aus den Favoriten entfernt');
      if (reiter === 'favorit') zeigeOrdner(aktuell);
      return;
    }
    const mehr = e.target.closest('[data-mehr]');
    if (!mehr) return;
    e.stopPropagation();
    const offen = kontextEl && kontextEl.dataset.fuer === mehr.dataset.id;
    schliesseKontext();
    if (!offen) zeigeKontext(mehr, mehr.dataset.id);
  });

  // Rechtsklick (Maus) oder lange drücken (Finger, Stift) auf eine Karte: dasselbe Menü wie der Pfeil am Namen, dort, wo
  // man hingeklickt hat
  const kartenKnopf = el => { const k = el && el.closest('.karte'); return k ? k.querySelector('[data-mehr]') : null; };
  inhalt.addEventListener('contextmenu', e => {
    const knopf = kartenKnopf(e.target);
    if (!knopf) return;
    e.preventDefault();
    schliesseKontext();
    zeigeKontext(knopf, knopf.dataset.id, { x: e.clientX, y: e.clientY });
  });
  let langDruck = null;
  inhalt.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !kartenKnopf(e.target)) return;
    clearTimeout(langDruck && langDruck.t);
    const knopf = kartenKnopf(e.target), x = e.clientX, y = e.clientY;
    langDruck = { x, y, t: setTimeout(() => { langDruck = { offen: true }; schliesseKontext(); zeigeKontext(knopf, knopf.dataset.id, { x, y }); }, 430) };
  });
  inhalt.addEventListener('pointermove', e => { if (langDruck && !langDruck.offen && Math.hypot(e.clientX - langDruck.x, e.clientY - langDruck.y) > 10) { clearTimeout(langDruck.t); langDruck = null; } });
  const langDruckEnde = () => { if (langDruck && !langDruck.offen) { clearTimeout(langDruck.t); langDruck = null; } };
  inhalt.addEventListener('pointerup', langDruckEnde);
  inhalt.addEventListener('pointercancel', langDruckEnde);
  // Nach dem langen Drücken soll der Finger beim Loslassen das Dokument nicht auch noch öffnen
  inhalt.addEventListener('click', e => { if (langDruck && langDruck.offen) { langDruck = null; if (e.target.closest('.karte-link, .karte')) { e.preventDefault(); e.stopPropagation(); } } }, true);

  function zeigeKontext(knopf, id, bei) {
    const it = get(id);
    if (!it) return;
    const el = document.createElement('div');
    el.className = 'kontext';
    el.dataset.fuer = id;
    el.setAttribute('role', 'menu');
    if (it.art === 'ordner') {
      el.innerHTML = `
        <button type="button" role="menuitem" data-aktion="umbenennen">Umbenennen</button>
        <button type="button" role="menuitem" data-aktion="verschieben">Verschieben …</button>
        <div class="kontext-farben" role="group" aria-label="Farbe">${Object.entries(FARBEN).map(([f, n]) =>
          `<button type="button" data-farbe-wahl="${f}" aria-label="${n}" aria-pressed="${it.farbe === f}" style="--farbe: var(--s-${f})"></button>`).join('')}</div>
        <button type="button" role="menuitem" data-aktion="loeschen" class="gefahr">Löschen</button>`;
    } else {
      el.innerHTML = `
        <button type="button" role="menuitem" data-aktion="oeffnen">Öffnen</button>
        <button type="button" role="menuitem" data-aktion="daneben">Daneben öffnen</button>
        <button type="button" role="menuitem" data-aktion="fenster">In neuem Fenster öffnen</button>
        <button type="button" role="menuitem" data-aktion="umbenennen">Umbenennen</button>
        <button type="button" role="menuitem" data-aktion="verschieben">Verschieben …</button>
        <button type="button" role="menuitem" data-aktion="duplizieren">Duplizieren</button>
        ${Zeit.sichtbar() ? '<button type="button" role="menuitem" data-aktion="statistik">Lernzeit ansehen</button>' : ''}
        ${window.lernheftDesktop && window.lernheftDesktop.oeffneOrdner ? '<button type="button" role="menuitem" data-aktion="ordner">Im Ordner zeigen</button>' : ''}
        ${it.art === 'skript' ? `<div class="kontext-titel">Darstellung</div>
          ${Object.entries(MODI).map(([m, n]) => `<button type="button" role="menuitemradio" aria-checked="${it.modus === m}" data-modus-wahl="${m}">${n}</button>`).join('')}` : ''}
        <div class="kontext-titel">Exportieren</div>
        ${it.art === 'skript'
          ? `<button type="button" role="menuitem" data-export="notizen-blatt" title="Nur was auf den Seiten des Skripts geschrieben ist">PDF mit Notizen auf dem Skript</button>
             <button type="button" role="menuitem" data-export="notizen" title="Auch was neben den Seiten steht: die Seiten werden dafür grösser">PDF mit allen Notizen (auch daneben)</button>
             <button type="button" role="menuitem" data-export="original">Original-PDF</button>`
          : `<button type="button" role="menuitem" data-export="hell">PDF (weiss, zum Drucken)</button>
             <button type="button" role="menuitem" data-export="dunkel">PDF (dunkelblau)</button>`}
        <button type="button" role="menuitem" data-export="png">${istBrett(it) ? 'PNG' : 'PNG (alle Seiten)'}</button>
        <div class="kontext-titel">Umwandeln</div>
        ${istBrett(it) ? '<button type="button" role="menuitem" data-aktion="zuseiten">Als Seiten-Dokument kopieren …</button>'
          : '<button type="button" role="menuitem" data-aktion="zubrett">Als Whiteboard kopieren …</button>'}
        <button type="button" role="menuitem" data-aktion="loeschen" class="gefahr">Löschen</button>`;
    }
    document.body.appendChild(el);
    const r = bei ? { left: bei.x, right: bei.x + el.offsetWidth, top: bei.y, bottom: bei.y } : knopf.getBoundingClientRect();
    const b = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(r.right - b, window.innerWidth - b - 8)) + 'px';
    el.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
    kontextEl = el;
    const erster = el.querySelector('button');
    if (erster) erster.focus({ preventScroll: true });

    el.addEventListener('click', async e => {
      const k = e.target.closest('button');
      if (!k) return;
      if (k.dataset.farbeWahl) { aendere(id, o => { o.farbe = k.dataset.farbeWahl; }); schliesseKontext(); zeigeOrdner(aktuell); return; }
      if (k.dataset.modusWahl) { aendere(id, o => { o.modus = k.dataset.modusWahl; }); schliesseKontext(); zeigeOrdner(aktuell); return; }
      schliesseKontext();
      if (k.dataset.export) { exportiere(id, k.dataset.export); return; }
      const aktion = k.dataset.aktion;
      if (aktion === 'oeffnen') location.hash = '#/dok/' + id;
      else if (aktion === 'daneben') Dokument.daneben(id);
      else if (aktion === 'fenster') Dokument.inEigenesFenster(id);
      else if (aktion === 'statistik') zeigeStatistik(id);
      else if (aktion === 'zubrett') Umwandeln.seitenZuBrett(id);
      else if (aktion === 'zuseiten') Umwandeln.brettZuSeiten(id);
      else if (aktion === 'ordner') window.lernheftDesktop.oeffneOrdner(id);
      else if (aktion === 'umbenennen') {
        const name = await frageName(it.art === 'ordner' ? 'Ordner umbenennen' : 'Umbenennen', it.name, 'Speichern');
        if (name) { aendere(id, o => { o.name = name; }); zeigeOrdner(aktuell); }
      } else if (aktion === 'verschieben') {
        const wahl = await waehleZielordner(`„${it.name}“ verschieben`, it.art === 'ordner' ? nachfahren(id) : [], it.eltern);
        if (wahl) verschiebe(id, wahl.ziel);
      } else if (aktion === 'duplizieren') {
        const neu = dupliziere(id);
        zeigeOrdner(aktuell);
        meldung('Kopie angelegt', { text: 'Öffnen', fn: () => { location.hash = '#/dok/' + neu; } });
      } else if (aktion === 'loeschen') {
        if (it.art === 'ordner') loescheOrdner(id); else loescheDokument(id);
      }
    });
  }
  document.addEventListener('click', e => { if (kontextEl && !kontextEl.contains(e.target)) schliesseKontext(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') schliesseKontext(); });
  window.addEventListener('resize', schliesseKontext);
  window.addEventListener('scroll', schliesseKontext, { passive: true });

  /* ---------- Kopieren, Löschen, Exportieren ---------- */

  function dupliziere(id) {
    const it = get(id);
    const neu = neueId();
    speichere(neu, { ...it, name: it.name + ' (Kopie)', erstellt: Date.now(), geoeffnet: 0, favorit: false });
    const p = 'ink:' + id + ':';
    for (const k of Daten.keys(p)) Daten.set('ink:' + neu + ':' + k.slice(p.length), Daten.get(k));
    return neu;
  }

  async function entferneDokument(id) {
    const it = get(id);
    if (!it) return;
    for (const k of Daten.keys('ink:' + id + ':')) Daten.del(k);
    Daten.del('bib:' + id);
    // Die PDF nur löschen, wenn keine Kopie sie noch braucht
    if (it.art === 'skript' && !dokumente().some(d => d.art === 'skript' && d.datei === it.datei)) {
      await Daten.datei.del('pdf:' + it.datei);
      await Daten.datei.del('vorschau:' + it.datei);
      vorschauCache.delete(it.datei);
    }
  }
  async function loescheDokument(id) {
    const it = get(id);
    const ok = await bestaetige(it.art === 'skript' ? 'Skript löschen?' : 'Notizbuch löschen?',
      `„${esc(it.name)}“ und alle Notizen darin werden gelöscht.${window.lernheftDesktop ? ' Es landet im Papierkorb der Bibliothek und lässt sich dort wiederherstellen.' : ''}`, 'Löschen');
    if (!ok) return;
    await entferneDokument(id);
    zeigeOrdner(aktuell);
    meldung('Gelöscht');
  }
  async function loescheOrdner(id) {
    const o = get(id), alleOrdner = nachfahren(id);
    const ds = dokumente().filter(d => alleOrdner.includes(d.eltern));
    const text = ds.length || alleOrdner.length > 1 ? `„${esc(o.name)}“ enthält ${inhaltText(id)}. Alles darin wird gelöscht.` : `Der leere Ordner „${esc(o.name)}“ wird gelöscht.`;
    if (!await bestaetige('Ordner löschen?', text, 'Löschen')) return;
    for (const d of ds) await entferneDokument(d.id);
    for (const oid of alleOrdner) Daten.del('bib:' + oid);
    zeigeOrdner(aktuell);
    meldung('Ordner gelöscht');
  }

  // PNG: opt.seite = Nummer (ab 0) einer Seite, sonst alle Seiten; ein Whiteboard ergibt ein Bild
  async function exportierePng(id, it, opt) {
    const bilder = await PdfDienst.exportierePng(id, { seite: opt && opt.seite, fortschritt: (i, n) => warteText(`Seite ${i} von ${n} …`) });
    schliesseDialog();
    const B = window.lernheftDesktop;
    if (B && B.speichereUnter) {
      const dateien = [];
      for (const b of bilder) dateien.push({ name: UI.dateiName(b.name) + '.png', daten: await b.blob.arrayBuffer() });
      await speichereWo(B, dateien, bilder.length === 1 ? `${UI.dateiName(bilder[0].name)}.png` : `${bilder.length} PNG-Dateien`);
      return;
    }
    // Ältere Lernheft-App ohne Dialog: in den Ordner des Dokuments; Browser: herunterladen
    let letzter = null;
    for (const b of bilder) {
      const dn = UI.dateiName(b.name);
      if (B && B.exportiereDatei) letzter = await B.exportiereDatei(id, dn, await b.blob.arrayBuffer(), '.png');
      else await UI.speichereDatei(dn + '.png', b.blob, 'notizbuch', pfadNamen(it.eltern));
    }
    if (letzter) meldung(bilder.length === 1 ? `Gespeichert: ${UI.dateiName(bilder[0].name)}.png` : `${bilder.length} PNG-Dateien gespeichert`, { text: 'Im Ordner zeigen', fn: () => B.zeigeDatei(letzter) });
  }

  // Lernheft-App: fragen, wohin der Export soll ("Speichern unter", mehrere Bilder: Ordner wählen), und nur dort
  // speichern. Im Ordner des Dokuments bleibt nur das Original. Der zuletzt gewählte Ordner wird vorgeschlagen.
  async function speichereWo(B, dateien, was) {
    let r;
    try { r = await B.speichereUnter(dateien, Daten.get('lokal:export-ordner', '')); } catch (e) { r = { fehler: e.message }; }
    // iPad: über das Teilen-Menü gesichert, dort sieht man schon, wohin
    if (r && r.geteilt) return;
    if (r && r.dateien && r.dateien.length) {
      if (r.ordner) Daten.set('lokal:export-ordner', r.ordner);
      const ort = r.ordner.split(/[\\/]/).filter(Boolean).pop() || r.ordner;
      meldung(`Gespeichert: ${was} in „${ort}“`, { text: 'Zeigen', fn: () => B.zeigeDatei(r.dateien[0]) });
    } else if (r && r.abgebrochen) meldung('Export abgebrochen, es wurde nichts gespeichert.');
    else meldung('Der Export konnte nicht gespeichert werden' + (r && r.fehler ? ': ' + r.fehler : '.'));
  }

  // art: 'notizen' (alle Notizen, die Seiten wachsen um das, was daneben steht), 'notizen-blatt' (nur was auf den
  // Seiten des Skripts steht), 'original', bei Notizbüchern 'hell' oder 'dunkel', 'png'
  async function exportiere(id, art, opt) {
    const it = get(id);
    if (!it) return;
    warteDialog('Export wird erstellt …');
    try {
      if (art === 'png') { await exportierePng(id, it, opt); return; }
      let blob, name, ziel;
      if (art === 'original') {
        blob = await Daten.datei.get('pdf:' + it.datei);
        if (!blob) throw new Error('Die PDF ist auf diesem Gerät nicht vorhanden.');
        name = it.name; ziel = 'original';
      } else if (art === 'notizen' || art === 'notizen-blatt') {
        const nurBlatt = art === 'notizen-blatt';
        blob = await PdfDienst.exportiereSkript(id, (i, n) => warteText(`Seite ${i} von ${n} …`), { nurBlatt });
        name = it.name + (nurBlatt ? ' (mit Notizen)' : ' (mit allen Notizen)'); ziel = 'bearbeitet';
      } else {
        blob = await PdfDienst.exportiereNotizbuch(id, art);
        name = it.name + (art === 'dunkel' ? ' (dunkel)' : ''); ziel = 'notizbuch';
      }
      schliesseDialog();
      const B = window.lernheftDesktop;
      const dn = UI.dateiName(name);
      if (B && B.speichereUnter) await speichereWo(B, [{ name: dn + '.pdf', daten: await blob.arrayBuffer() }], dn + '.pdf');
      else if (B && B.exportiereDok) {
        // Ältere Lernheft-App ohne Dialog: in den Ordner des Dokuments (das Original-PDF liegt dort schon)
        const pfad = art === 'original' ? null : await B.exportiereDok(id, dn, await blob.arrayBuffer());
        meldung(pfad ? `Gespeichert: ${dn}.pdf` : 'Das Original-PDF liegt im Ordner des Skripts.', pfad ? { text: 'Im Ordner zeigen', fn: () => B.zeigeDatei(pfad) } : undefined);
      } else await UI.speichereDatei(dn + '.pdf', blob, ziel, pfadNamen(it.eltern));
    } catch (e) {
      schliesseDialog();
      console.error(e);
      meldung(e && e.message ? e.message : 'Der Export hat nicht geklappt.');
    }
  }

  /* ---------- Lernzeit eines Skripts oder Notizbuchs ---------- */

  function zeigeStatistik(id) {
    const it = get(id);
    if (!it) return;
    const z = Zeit.dokZeit(id);
    const h = new Date();
    const tage = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(h); d.setDate(d.getDate() - i); tage.push([d, z.tage[Zeit.iso(d)] || 0]); }
    const max = Math.max(1800, ...tage.map(t => t[1]));
    const aktiveTage = Object.values(z.tage).filter(s => s > 0).length;
    oeffneDialog(`<div class="dialog-form">
        <h2>Lernzeit: ${esc(it.name)}</h2>
        <div class="stat-zahlen">
          <div><strong>${esc(Zeit.text(z.sekunden))}</strong><span>insgesamt</span></div>
          <div><strong>${z.sitzungen || 0}</strong><span>${z.sitzungen === 1 ? 'Mal geöffnet' : 'Mal geöffnet'}</span></div>
          <div><strong>${aktiveTage}</strong><span>${aktiveTage === 1 ? 'Tag' : 'Tage'} daran gearbeitet</span></div>
          <div><strong>${esc(z.sitzungen ? Zeit.text(z.sekunden / z.sitzungen) : '0 min')}</strong><span>im Schnitt pro Mal</span></div>
        </div>
        <p class="kennzahl-titel">Letzte 14 Tage</p>
        <div class="stat-balken">${tage.map(([d, s]) => `<span data-tipp="${esc(d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }))}: ${esc(Zeit.text(s))}"><span style="height: ${Math.round(s / max * 100)}%"></span><em>${d.getDate()}.</em></span>`).join('')}</div>
        <p class="dialog-klein">Zuletzt geöffnet: ${esc(UI.zeitText(z.zuletzt || it.geoeffnet))}. Gezählt wird nur, solange das Fenster aktiv ist und du in den letzten zwei Minuten etwas gemacht hast.</p>
        <div class="dialog-knoepfe"><button type="button" class="btn-primaer" data-abbrechen>Schliessen</button></div>
      </div>`);
  }

  /* ---------- Papierkorb (nur in der Lernheft-App): ansehen, wiederherstellen, endgültig löschen ---------- */

  const papierkorbDa = () => !!(window.lernheftDesktop && window.lernheftDesktop.papierkorb);
  const PK_ART = { skript: 'Skript', notizbuch: 'Notizbuch', whiteboard: 'Whiteboard', seite: 'Notizbuch-Seite', ordner: 'Ordner', datei: 'Datei' };
  const PK_SYMBOL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13"/><path d="M10 11v5.5M14 11v5.5"/></svg>';
  const kannZurueck = e => (['skript', 'notizbuch', 'whiteboard'].includes(e.art) && !e.schonDa) || (e.art === 'seite' && !!e.notizbuch);
  let pkListe = [], pkToken = 0;
  $('ansicht-bibliothek').querySelector('[data-reiter="papierkorb"]').hidden = !papierkorbDa();

  async function zeigePapierkorb() {
    const t = ++pkToken;
    let liste = [];
    try { liste = await window.lernheftDesktop.papierkorb.liste(); } catch (e) { liste = []; }
    if (t !== pkToken || reiter !== 'papierkorb') return;
    pkListe = Array.isArray(liste) ? liste : [];
    if (!pkListe.length) {
      inhalt.innerHTML = `<div class="leer ablage">${PK_SYMBOL}<p><strong>Der Papierkorb ist leer.</strong> Was du in der Bibliothek löschst, landet hier. Bis du es endgültig löschst, lässt es sich mit allen Notizen wiederherstellen.</p></div>`;
      return;
    }
    const summe = pkListe.reduce((s, e) => s + (e.groesse || 0), 0);
    inhalt.innerHTML = `<section class="papierkorb">
        <div class="pk-kopf">
          <p><strong>${pkListe.length} ${pkListe.length === 1 ? 'Eintrag' : 'Einträge'} · ${UI.groesseText(summe)}</strong><br>Wiederherstellen legt alles mit seinen Notizen zurück in die Bibliothek. Endgültig löschen entfernt es samt Sicherungen und lässt sich nicht rückgängig machen.</p>
          <button class="btn-leise pk-gefahr" type="button" data-pk-leeren>Papierkorb leeren</button>
        </div>
        <ul class="pk-liste">${pkListe.map((e, i) => {
          const info = [PK_ART[e.art] || 'Datei'];
          if (e.seiten) info.push(`${e.seiten} ${e.seiten === 1 ? 'Seite' : 'Seiten'} mit Notizen`);
          info.push('gelöscht ' + UI.zeitText(e.zeit), UI.groesseText(e.groesse || 0));
          if (e.pdfFehlt) info.push('<span class="pk-warn">PDF fehlt</span>');
          if (e.schonDa) info.push('<span class="pk-warn">schon in der Bibliothek</span>');
          if (e.art === 'seite' && !e.notizbuch) info.push('<span class="pk-warn">das Notizbuch gibt es nicht mehr</span>');
          return `<li class="pk-eintrag">
            <span class="pk-symbol art-${esc(e.art)}">${PK_SYMBOL}</span>
            <span class="pk-text"><strong>${esc(e.titel)}${e.art === 'seite' ? ' · eine Seite' : ''}</strong><span>${info.join(' · ')}</span></span>
            <span class="pk-knoepfe">
              ${kannZurueck(e) ? `<button class="btn-leise klein" type="button" data-pk-zurueck="${i}">Wiederherstellen</button>` : ''}
              <button class="btn-leise klein pk-gefahr" type="button" data-pk-loeschen="${i}">Endgültig löschen</button>
            </span>
          </li>`;
        }).join('')}</ul>
      </section>`;
  }
  // Was die Oberfläche zu einem endgültig gelöschten Dokument noch weiss: Lernzeit, gemerkte Ansicht
  function vergiss(id) {
    if (!id) return;
    if (Daten.get('zeit:' + id) != null) Daten.del('zeit:' + id);
    if (Daten.get('lokal:ansicht:' + id) != null) Daten.del('lokal:ansicht:' + id);
    const weg = Daten.get('lokal:dateien-weg', []);
    if (Array.isArray(weg) && weg.some(k => k.endsWith(':' + id))) Daten.set('lokal:dateien-weg', weg.filter(k => !k.endsWith(':' + id)));
  }
  inhalt.addEventListener('click', async ev => {
    const z = ev.target.closest('[data-pk-zurueck]'), l = ev.target.closest('[data-pk-loeschen]'), alle = ev.target.closest('[data-pk-leeren]');
    if (!z && !l && !alle) return;
    ev.preventDefault();
    const P = window.lernheftDesktop.papierkorb;
    if (z) {
      const e = pkListe[Number(z.dataset.pkZurueck)];
      if (!e) return;
      const r = await P.zurueck(e.name);
      if (r && r.ok) meldung(e.art === 'seite' ? `Die Seite ist wieder in „${r.titel}“ (am Ende)` : `„${r.titel}“ ist wieder in der Bibliothek`, e.art === 'seite' ? undefined : { text: 'Öffnen', fn: () => { location.hash = '#/dok/' + r.id; } });
      else meldung((r && r.fehler) || 'Das hat nicht geklappt.');
    } else if (l) {
      const e = pkListe[Number(l.dataset.pkLoeschen)];
      if (!e) return;
      const was = e.art === 'seite' ? `Die Seite aus „${esc(e.titel)}“` : `„${esc(e.titel)}“`;
      if (!await bestaetige('Endgültig löschen?', `${was} wird mit allen Notizen und Sicherungen gelöscht. Das lässt sich nicht rückgängig machen.`, 'Endgültig löschen')) return;
      const r = await P.loeschen(e.name);
      if (r && r.ok) { vergiss(r.id); meldung('Endgültig gelöscht'); } else meldung((r && r.fehler) || 'Das hat nicht geklappt.');
    } else {
      const n = pkListe.length;
      if (!n || !await bestaetige('Papierkorb leeren?', `Alle ${n} ${n === 1 ? 'Eintrag wird' : 'Einträge werden'} mit allen Notizen und Sicherungen gelöscht. Das lässt sich nicht rückgängig machen.`, 'Alles endgültig löschen')) return;
      const r = await P.leeren();
      (r.ids || []).forEach(vergiss);
      meldung(r.fehler && r.fehler.length ? `${r.geloescht} gelöscht, ${r.fehler.length} nicht: ${r.fehler[0]}` : 'Der Papierkorb ist leer');
    }
    zeigePapierkorb();
  });

  /* ---------- Änderungen von aussen ---------- */

  let neuZeichnen = 0;
  Daten.on(({ key }) => {
    if (!key.startsWith('bib:') && !key.startsWith('ink:')) return;
    clearTimeout(neuZeichnen);
    neuZeichnen = setTimeout(() => {
      if (!$('ansicht-bibliothek').hidden) zeigeOrdner(aktuell && get(aktuell) ? aktuell : null);
      document.dispatchEvent(new CustomEvent('bibliothek:geaendert'));
    }, 250);
  });
  window.Bibliothek = {
    get, alle, dokumente, aendere, speichere, zeigeOrdner, pfadVon, pfadText, pfadNamen, kinderOrdner: id => sortiere(kinderOrdner(id), 'name'),
    ordnerSymbol, vorschauHtml, fuelleVorschau, neuDialog, neuesNotizbuch, neuesWhiteboard, pdfWaehlen: () => $('pdf-datei').click(),
    exportiere, dupliziere, loescheDokument, zeigeStatistik, istBrett, MODI, PAPIERE, RASTER, SEITENFARBEN
  };
});
