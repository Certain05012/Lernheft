'use strict';
// Seitenleiste für Skripte (PDF), links neben dem Blatt (Knopf ganz links in der Werkzeugleiste), Reiter: Seiten (alle Seiten als kleine Bilder), Inhalt (Abschnitte aus
// dem Inhaltsverzeichnis des PDFs, sonst aus grossen Überschriften erkannt), Lesezeichen, und die Suche im Text des PDFs.
// Lesezeichen stehen in der Beschreibung des Skripts (bib:<id>.lesezeichen = [Seitennummern]) und gleichen sich so über
// den Speicherort ab; auf dem Blatt zeigt sie ein Bändchen oben rechts. Suchtreffer werden auf dem Blatt markiert.
(function () {
  const { esc } = UI;
  const KEY = 'lokal:seitenleiste';   // { offen, reiter } auf diesem Gerät
  const REITER = { seiten: 'Seiten', inhalt: 'Inhalt', lesezeichen: 'Lesezeichen' };
  const SVG = {
    leiste: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/><path d="M5.8 8.5h1.4M5.8 11.5h1.4M5.8 14.5h1.4"/>',
    suche: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
    seiten: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    inhalt: '<path d="M9.5 6.5h10.5M9.5 12h10.5M9.5 17.5h10.5"/><circle cx="5" cy="6.5" r="1.3" class="voll"/><circle cx="5" cy="12" r="1.3" class="voll"/><circle cx="5" cy="17.5" r="1.3" class="voll"/>',
    lesezeichen: '<path d="M7 3.5h10v17l-5-4-5 4z"/>',
    zu: '<path d="M7 7l10 10M17 7L7 17"/>'
  };
  const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${SVG[n]}</svg>`;
  // Suchen ohne Rücksicht auf Gross/klein und Akzente ("uber" findet auch "Über" und "ÜBER")
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  // LaTeX-PDFs mit Schriften in T1-Kodierung melden Ligaturen und Striche oft als Steuerzeichen ("De\x1Cnition" statt
  // "Definition"): zurückübersetzen, sonst findet die Suche solche Wörter nicht; übrige Steuerzeichen werden Leerzeichen
  const T1 = { '\x15': '–', '\x16': '—', '\x1b': 'ff', '\x1c': 'fi', '\x1d': 'fl', '\x1e': 'ffi', '\x1f': 'ffl' };
  // Pfeile und Striche über Formelzeichen (⃗a) sind eigene Zeichen, die im Text nur stören
  const repariere = s => s.replace(/[\x00-\x1f]/g, c => T1[c] || ' ').replace(/[⃐-⃿]/g, '');
  const BAND = '#e5484d';

  // o: { el (Bereich des Dokuments), id, item() (aktuelle Beschreibung), lw() (Schreibfläche), aendere(fn) }
  function Seitenleiste(o) {
    const S = {};
    const einst = Object.assign({ offen: false, reiter: 'seiten' }, Daten.get(KEY, {}));
    if (!REITER[einst.reiter]) einst.reiter = 'seiten';
    let pdf = null, modus = einst.reiter, offen = false, weg = false;
    let suchText = '', suchToken = 0, suchTimer = 0, treffer = [], aktuell = -1;
    const trefferJeSeite = new Map();   // Seitennummer -> [Treffer]
    const texte = new Map();            // Seitennummer -> Promise { text, anzeige, teile }
    const minis = new Map();            // Seitennummer -> Stempel der gemalten Vorschau
    let inhaltVersprechen = null, inhalt = null;
    let miniSchlange = [], miniLaeuft = false;

    const aside = document.createElement('aside');
    aside.className = 'seitenleiste';
    aside.hidden = true;
    aside.innerHTML = `
      <div class="sl-kopf">
        <div class="sl-reiter" role="tablist" aria-label="Ansicht der Seitenleiste">
          ${Object.entries(REITER).map(([k, t]) => `<button class="wz" type="button" role="tab" data-reiter="${k}" title="${t}" aria-label="${t}">${icon(k)}</button>`).join('')}
          <button class="wz" type="button" role="tab" data-reiter="suche" title="Im PDF suchen (Strg+F)" aria-label="Im PDF suchen">${icon('suche')}</button>
        </div>
        <button class="wz" type="button" data-sl="zu" title="Seitenleiste schliessen" aria-label="Seitenleiste schliessen">${icon('zu')}</button>
      </div>
      <div class="sl-suche" hidden>
        <label class="sl-suchfeld">${icon('suche')}<input type="search" placeholder="Im PDF suchen" aria-label="Im PDF suchen" autocomplete="off" spellcheck="false"></label>
        <div class="sl-suchinfo"><span data-sl="anzahl"></span>
          <span class="sl-pfeile"><button class="btn-leise klein" type="button" data-sl="zurueck" title="Voriger Treffer (Umschalt+Enter)" aria-label="Voriger Treffer">↑</button><button class="btn-leise klein" type="button" data-sl="weiter" title="Nächster Treffer (Enter)" aria-label="Nächster Treffer">↓</button></span>
        </div>
      </div>
      <div class="sl-titel" data-sl="titel"></div>
      <div class="sl-inhalt" data-sl="inhalt"></div>`;
    o.el.appendChild(aside);
    const $ = sel => aside.querySelector(sel);
    const feld = $('.sl-suche input');
    const liste = $('[data-sl="inhalt"]');
    const lw = () => o.lw();
    const lesezeichen = () => (Array.isArray(o.item().lesezeichen) ? o.item().lesezeichen : []);
    const seitenZahl = () => (pdf ? pdf.numPages : 0);
    const aktuelleNr = () => (lw() ? lw().aktuelleSeite() + 1 : 1);
    const merken = () => Daten.set(KEY, { offen, reiter: modus === 'suche' ? einst.reiter : modus });

    /* ----- Knöpfe ganz links in der Werkzeugleiste ----- */

    function knoepfe(anfang) {
      anfang.innerHTML = `
        <button class="wz" type="button" data-sl="leiste" title="Seitenleiste: Seiten, Inhalt, Lesezeichen, Suche" aria-label="Seitenleiste" aria-pressed="false">${icon('leiste')}</button>`;
      anfang.querySelector('[data-sl="leiste"]').addEventListener('click', () => (offen ? schliessen() : oeffnen(einst.reiter)));
      S.anfang = anfang;
      zeigeKnoepfe();
    }
    function zeigeKnoepfe() {
      if (!S.anfang) return;
      S.anfang.querySelector('[data-sl="leiste"]').setAttribute('aria-pressed', String(offen));
    }

    /* ----- Öffnen, schliessen, Reiter ----- */

    function oeffnen(m) {
      modus = m;
      if (m !== 'suche') einst.reiter = m;
      offen = true;
      aside.hidden = false;
      o.el.classList.add('sl-offen');
      aside.querySelectorAll('[data-reiter]').forEach(k => k.setAttribute('aria-selected', String(k.dataset.reiter === m)));
      $('.sl-suche').hidden = m !== 'suche';
      zeigeKnoepfe();
      merken();
      bauen();
      if (m === 'suche') { feld.focus(); feld.select(); }
      else if (suchText) { suchText = ''; feld.value = ''; leereTreffer(); }
    }
    function schliessen() {
      offen = false;
      aside.hidden = true;
      o.el.classList.remove('sl-offen');
      if (treffer.length) leereTreffer();
      suchText = '';
      feld.value = '';
      zeigeKnoepfe();
      merken();
    }
    aside.addEventListener('click', e => {
      const r = e.target.closest('[data-reiter]');
      if (r) { oeffnen(r.dataset.reiter); return; }
      const k = e.target.closest('[data-sl]');
      if (k && k.dataset.sl === 'zu') schliessen();
      else if (k && k.dataset.sl === 'weiter') springeTreffer(1);
      else if (k && k.dataset.sl === 'zurueck') springeTreffer(-1);
    });
    // Tippen, Wischen und Schreiben in der Leiste gehören nicht der Schreibfläche
    aside.addEventListener('pointerdown', e => e.stopPropagation());
    aside.addEventListener('keydown', e => e.stopPropagation());

    function bauen() {
      if (!offen) return;
      const titel = $('[data-sl="titel"]');
      if (!pdf) { titel.textContent = ''; liste.innerHTML = '<p class="sl-leer">PDF wird geladen …</p>'; return; }
      if (modus === 'seiten') { titel.textContent = `${seitenZahl()} Seiten`; bauRaster(Array.from({ length: seitenZahl() }, (_, i) => i + 1)); }
      else if (modus === 'lesezeichen') bauLesezeichen();
      else if (modus === 'inhalt') bauInhalt();
      else bauSuche();
    }

    /* ----- Seiten als kleine Bilder ----- */

    let beobachter = null;
    function bauRaster(nummern, leerText) {
      if (beobachter) beobachter.disconnect();
      miniSchlange = [];
      const lz = lesezeichen(), jetzt = aktuelleNr();
      const seiten = lw() ? lw().seiten() : [];
      if (!nummern.length) { liste.innerHTML = `<p class="sl-leer">${leerText || ''}</p>`; return; }
      liste.innerHTML = `<div class="sl-raster">${nummern.map(nr => {
        const s = seiten[nr - 1];
        const verh = s ? `${Math.round(s.b)} / ${Math.round(s.h)}` : '794 / 1123';
        const ab = abschnittVon(nr);
        return `<button class="sl-seite${nr === jetzt ? ' aktuell' : ''}" type="button" data-nr="${nr}" title="Seite ${nr}${ab ? ' · ' + esc(ab.titel) : ''}">
          <span class="sl-bild" style="aspect-ratio: ${verh}"><canvas></canvas>${lz.includes(nr) ? '<span class="sl-band" aria-label="Lesezeichen"></span>' : ''}</span>
          <span class="sl-nr">${nr}</span>
        </button>`;
      }).join('')}</div>`;
      minis.clear();
      beobachter = 'IntersectionObserver' in window ? new IntersectionObserver(eintraege => {
        for (const e of eintraege) if (e.isIntersecting) { beobachter.unobserve(e.target); miniAnfordern(Number(e.target.dataset.nr), e.target.querySelector('canvas')); }
      }, { root: liste, rootMargin: '300px 0px' }) : null;
      liste.querySelectorAll('.sl-seite').forEach(k => (beobachter ? beobachter.observe(k) : miniAnfordern(Number(k.dataset.nr), k.querySelector('canvas'))));
      const a = liste.querySelector('.sl-seite.aktuell');
      if (a) a.scrollIntoView({ block: 'center' });
    }
    liste.addEventListener('click', e => {
      const k = e.target.closest('[data-nr]');
      if (k && !e.target.closest('[data-weg]')) { gehZu(Number(k.dataset.nr), Number(k.dataset.y) || 0); return; }
      const w = e.target.closest('[data-weg]');
      if (w) S.lesezeichen(Number(w.dataset.weg), false);
      const t = e.target.closest('[data-treffer]');
      if (t) zeigeTreffer(Number(t.dataset.treffer));
    });
    function gehZu(nr, y) {
      if (!lw()) return;
      lw().springeZuSeite(nr - 1, true, y);
      // Auf schmalen Bildschirmen deckt die Leiste das Blatt zu: nach der Wahl Platz machen
      if (window.innerWidth < 700) schliessen();
    }

    function miniAnfordern(nr, cv) {
      if (!cv) return;
      miniSchlange.push({ nr, cv });
      if (!miniLaeuft) miniWeiter();
    }
    async function miniWeiter() {
      miniLaeuft = true;
      while (miniSchlange.length && pdf && !weg) {
        const { nr, cv } = miniSchlange.shift();
        if (!cv.isConnected) continue;
        try { await malMini(nr, cv); } catch (e) { /* kaputte Seite: bleibt leer */ }
      }
      miniLaeuft = false;
    }
    // Stempel der Handschrift einer Seite: ändert er sich, wird die Vorschau neu gemalt
    function stempel(nr) {
      const inh = Daten.get('ink:' + o.id + ':p' + nr);
      if (!inh || !inh.e) return '0';
      let m = 0;
      for (const e of inh.e) m = Math.max(m, e.m || 0);
      return inh.e.length + ':' + m + ':' + Object.keys(inh.x || {}).length;
    }
    async function malMini(nr, cv) {
      const seite = await pdf.getPage(nr);
      const vp1 = seite.getViewport({ scale: PdfDienst.EINHEIT });
      const breite = Math.round(Math.min(2, window.devicePixelRatio || 1) * 128);
      const vp = seite.getViewport({ scale: PdfDienst.EINHEIT * breite / vp1.width });
      const quelle = document.createElement('canvas');
      quelle.width = Math.max(1, Math.floor(vp.width)); quelle.height = Math.max(1, Math.floor(vp.height));
      const qc = quelle.getContext('2d', { willReadFrequently: true });
      qc.fillStyle = '#fff';
      qc.fillRect(0, 0, quelle.width, quelle.height);
      await seite.render({ canvasContext: qc, viewport: vp }).promise;
      if (weg || !cv.isConnected) { quelle.width = 0; return; }
      const hell = PdfDienst.helligkeit(quelle), m = o.item().modus || 'original';
      if (PdfDienst.umfaerbenNoetig(m, hell)) PdfDienst.umfaerben(quelle, m);
      const fl = m === 'dunkel' || m === 'dunkelgrau' ? 'dunkel' : m === 'hell' ? 'hell' : hell > 0.5 ? 'hell' : 'dunkel';
      const sz = { b: vp1.width, h: vp1.height };
      const inh = Daten.get('ink:' + o.id + ':p' + nr);
      await Leinwand.bilderBereit(inh && inh.e);
      if (weg || !cv.isConnected) { quelle.width = 0; return; }
      Leinwand.malBild(cv, { seite: sz, liste: inh && inh.e ? inh.e : [], flaeche: fl, massstab: breite / vp1.width, hintergrund: c => { c.drawImage(quelle, 0, 0, sz.b, sz.h); return true; } });
      quelle.width = 0;
      minis.set(nr, stempel(nr));
    }
    // Nach dem Schreiben: Vorschau der Seite auffrischen, wenn sie zu sehen ist
    S.inkGeaendert = nr => {
      if (!offen || (modus !== 'seiten' && modus !== 'lesezeichen') || !minis.has(nr) || minis.get(nr) === stempel(nr)) return;
      const k = liste.querySelector(`.sl-seite[data-nr="${nr}"] canvas`);
      if (k) { minis.delete(nr); miniAnfordern(nr, k); }
    };

    /* ----- Lesezeichen ----- */

    function bauLesezeichen() {
      const lz = lesezeichen().slice().sort((a, b) => a - b);
      const jetzt = aktuelleNr(), hat = lz.includes(jetzt);
      $('[data-sl="titel"]').innerHTML = `<span>${lz.length ? lz.length + ' Lesezeichen' : 'Lesezeichen'}</span>
        <button class="btn-leise klein" type="button" data-umschalten>${hat ? `Seite ${jetzt} entfernen` : `Seite ${jetzt} merken`}</button>`;
      $('[data-sl="titel"] [data-umschalten]').onclick = () => S.lesezeichen(jetzt, !hat);
      if (!lz.length) { liste.innerHTML = '<p class="sl-leer">Noch keine Lesezeichen. Setze eines mit „Seite merken“ oben oder im Menü ⋯ der Werkzeugleiste. Die Seite trägt dann oben rechts ein rotes Bändchen.</p>'; return; }
      bauRaster(lz);
      // Unter jedem Bild der Abschnitt und ein Knopf zum Entfernen
      liste.querySelectorAll('.sl-seite').forEach(k => {
        const nr = Number(k.dataset.nr), ab = abschnittVon(nr);
        k.querySelector('.sl-nr').innerHTML = `Seite ${nr}${ab ? `<small>${esc(ab.titel)}</small>` : ''}`;
        const x = document.createElement('span');
        x.className = 'sl-weg';
        x.dataset.weg = nr;
        x.title = 'Lesezeichen entfernen';
        x.setAttribute('role', 'button');
        x.innerHTML = icon('zu');
        k.querySelector('.sl-bild').appendChild(x);
      });
      // Für die Abschnittsnamen das Inhaltsverzeichnis im Hintergrund laden
      if (!inhalt) ladeInhalt().then(() => { if (offen && modus === 'lesezeichen') bauLesezeichen(); });
    }
    S.istLesezeichen = nr => lesezeichen().includes(nr);
    S.lesezeichen = (nr, an) => {
      o.aendere(x => {
        const l = new Set(Array.isArray(x.lesezeichen) ? x.lesezeichen : []);
        if (an) l.add(nr); else l.delete(nr);
        if (l.size) x.lesezeichen = [...l].sort((a, b) => a - b); else delete x.lesezeichen;
      });
      UI.meldung(an ? `Lesezeichen auf Seite ${nr} gesetzt` : `Lesezeichen von Seite ${nr} entfernt`);
      S.aktualisiere();
    };
    // Die Beschreibung hat sich geändert (hier oder auf einem anderen Gerät)
    S.aktualisiere = () => {
      if (lw()) lw().plane();
      if (offen && (modus === 'lesezeichen' || modus === 'seiten')) {
        if (modus === 'lesezeichen') bauLesezeichen();
        else {
          const lz = lesezeichen();
          liste.querySelectorAll('.sl-seite').forEach(k => {
            const nr = Number(k.dataset.nr), band = k.querySelector('.sl-band');
            if (lz.includes(nr) && !band) k.querySelector('.sl-bild').insertAdjacentHTML('beforeend', '<span class="sl-band" aria-label="Lesezeichen"></span>');
            else if (!lz.includes(nr) && band) band.remove();
          });
        }
      }
    };

    /* ----- Inhalt: Abschnitte ----- */

    // Seite und Stelle (Einheiten von oben) eines Ziels im Inhaltsverzeichnis des PDFs
    async function zielVon(dest) {
      try {
        const d = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
        if (!Array.isArray(d) || d[0] == null) return null;
        const index = typeof d[0] === 'object' ? await pdf.getPageIndex(d[0]) : Number(d[0]);
        if (!(index >= 0)) return null;
        let y = 0;
        // [Seite, { name: 'XYZ' }, links, oben, Zoom] oder FitH/FitBH mit oben
        const name = d[1] && d[1].name;
        const oben = name === 'XYZ' ? d[3] : (name === 'FitH' || name === 'FitBH') ? d[2] : null;
        if (oben != null) {
          const vp = (await pdf.getPage(index + 1)).getViewport({ scale: PdfDienst.EINHEIT });
          y = Math.max(0, vp.convertToViewportPoint(0, oben)[1] - 24);
        }
        return { nr: index + 1, y };
      } catch (e) { return null; }
    }
    async function flach(eintraege, tiefe, aus) {
      for (const x of eintraege) {
        const z = await zielVon(x.dest);
        if (z) aus.push({ titel: String(x.title || '').trim() || `Seite ${z.nr}`, tiefe, nr: z.nr, y: z.y });
        if (x.items && x.items.length && tiefe < 3) await flach(x.items, tiefe + 1, aus);
      }
      return aus;
    }
    function ladeInhalt() {
      if (!inhaltVersprechen && pdf) {
        inhaltVersprechen = (async () => {
          const o2 = await pdf.getOutline().catch(() => null);
          const eintraege = o2 && o2.length ? await flach(o2, 0, []) : [];
          inhalt = eintraege.length ? { quelle: 'pdf', eintraege } : { quelle: 'erkannt', eintraege: await erkenneUeberschriften() };
          return inhalt;
        })().catch(() => (inhalt = { quelle: 'erkannt', eintraege: [] }));
      }
      return inhaltVersprechen || Promise.resolve(null);
    }
    // Ohne Inhaltsverzeichnis: Zeilen, deren Schrift deutlich grösser ist als die des Fliesstexts, sind Überschriften.
    // Was auf vielen Seiten gleich steht (Kopf- und Fusszeilen), zählt nicht.
    async function erkenneUeberschriften() {
      const zeilen = [], groessen = new Map(), haeufig = new Map();
      for (let nr = 1; nr <= seitenZahl() && !weg; nr++) {
        const t = await textVon(nr);
        for (const z of t.zeilen) {
          zeilen.push(z);
          groessen.set(z.h, (groessen.get(z.h) || 0) + z.text.length);
          haeufig.set(z.text, (haeufig.get(z.text) || 0) + 1);
        }
      }
      let fliess = 0, beste = -1;
      for (const [h, n] of groessen) if (n > beste) { beste = n; fliess = h; }
      const kandidaten = zeilen.filter(z => z.h >= fliess * 1.2 && z.text.length >= 3 && z.text.length <= 90 && /\p{L}{2}/u.test(z.text) && haeufig.get(z.text) <= 2);
      const stufen = [...new Set(kandidaten.map(z => z.h))].sort((a, b) => b - a);
      return kandidaten.slice(0, 300).map(z => ({ titel: z.text, tiefe: Math.min(2, stufen.indexOf(z.h)), nr: z.nr, y: Math.max(0, z.y - 24) }));
    }
    function abschnittVon(nr, y = Infinity) {
      if (!inhalt) return null;
      let r = null;
      for (const e of inhalt.eintraege) if (e.nr < nr || (e.nr === nr && e.y <= y)) r = e;
      return r;
    }
    async function bauInhalt() {
      const titel = $('[data-sl="titel"]');
      if (!inhalt) {
        titel.textContent = 'Inhalt';
        liste.innerHTML = '<p class="sl-leer"><span class="kreisel" aria-hidden="true"></span> Abschnitte werden gesucht …</p>';
        await ladeInhalt();
        if (!offen || modus !== 'inhalt') return;
      }
      const e = inhalt.eintraege;
      titel.textContent = !e.length ? 'Inhalt' : inhalt.quelle === 'pdf' ? `Inhalt · ${e.length} Abschnitte` : `Inhalt · ${e.length} erkannte Überschriften`;
      if (!e.length) { liste.innerHTML = '<p class="sl-leer">In diesem PDF wurden keine Abschnitte gefunden: es hat kein Inhaltsverzeichnis, und es gibt keine Überschriften in grösserer Schrift.</p>'; return; }
      const jetzt = abschnittVon(aktuelleNr(), 1e9);
      const lz = lesezeichen();
      liste.innerHTML = `${inhalt.quelle === 'erkannt' ? '<p class="sl-hinweis">Das PDF hat kein eigenes Inhaltsverzeichnis. Diese Überschriften sind an der grösseren Schrift erkannt.</p>' : ''}
        <div class="sl-liste">${e.map(x => `<button class="sl-abschnitt${x === jetzt ? ' aktuell' : ''}" type="button" data-nr="${x.nr}" data-y="${Math.round(x.y)}" style="--tiefe: ${x.tiefe}">
          <span class="sl-abschnitt-titel">${esc(x.titel)}</span><span class="sl-abschnitt-seite">${lz.includes(x.nr) ? '<span class="sl-band klein"></span>' : ''}${x.nr}</span>
        </button>`).join('')}</div>`;
      const a = liste.querySelector('.sl-abschnitt.aktuell');
      if (a) a.scrollIntoView({ block: 'center' });
    }

    /* ----- Suche ----- */

    // Text einer Seite mit der Lage jedes Stücks: für Suche und Überschriften. Gelesen wird jede Seite nur einmal.
    function textVon(nr) {
      if (!texte.has(nr)) {
        texte.set(nr, pdf.getPage(nr).then(async seite => {
          const vp = seite.getViewport({ scale: PdfDienst.EINHEIT });
          const tc = await seite.getTextContent();
          const teile = [], proZeile = new Map();
          let text = '', anzeige = '';
          for (const it of tc.items) {
            if (typeof it.str !== 'string') continue;
            const str = repariere(it.str), n = norm(str);
            if (n) {
              const [, , c, d, e, f] = it.transform;
              const hoehe = Math.hypot(c, d) || 10;
              const r = vp.convertToViewportRectangle([e, f - hoehe * 0.22, e + (it.width || 0), f + hoehe * 0.9]);
              teile.push({ a: text.length, n: n.length, x: Math.min(r[0], r[2]), y: Math.min(r[1], r[3]), b: Math.abs(r[2] - r[0]), h: Math.abs(r[3] - r[1]) });
              text += n;
              anzeige += n.length === str.length ? str : n;
              // Zeilen für die Überschriften: gleiche Grundlinie
              if (str.trim()) {
                const k = Math.round(f);
                const z = proZeile.get(k) || { text: '', h: 0, nr, y: Math.min(r[1], r[3]) };
                z.text += str;
                z.h = Math.max(z.h, Math.round(hoehe * 2) / 2);
                z.y = Math.min(z.y, r[1], r[3]);
                proZeile.set(k, z);
              }
            }
            if (it.hasEOL) { text += ' '; anzeige += ' '; }
          }
          const zeilen = [...proZeile.values()].map(z => ({ ...z, text: z.text.replace(/\s+/g, ' ').trim() })).filter(z => z.text).sort((a, b) => a.y - b.y);
          return { text, anzeige, teile, zeilen };
        }).catch(() => ({ text: '', anzeige: '', teile: [], zeilen: [] })));
      }
      return texte.get(nr);
    }

    feld.addEventListener('input', () => {
      clearTimeout(suchTimer);
      suchTimer = setTimeout(() => suche(feld.value), 220);
    });
    feld.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); if (norm(feld.value.trim()) !== suchText) { clearTimeout(suchTimer); suche(feld.value); } else springeTreffer(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { e.preventDefault(); schliessen(); }
    });

    function leereTreffer() {
      suchToken++;
      treffer = []; aktuell = -1;
      trefferJeSeite.clear();
      if (lw()) lw().plane();
    }
    async function suche(roh) {
      const q = norm(roh.trim());
      if (q === suchText) return;
      suchText = q;
      leereTreffer();
      const t = suchToken;
      if (!q) { bauSuche(); return; }
      if (q.length < 2) { bauSuche('Mindestens zwei Zeichen eingeben.'); return; }
      const muster = new RegExp(q.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'g');
      bauSuche();
      for (let nr = 1; nr <= seitenZahl(); nr++) {
        const s = await textVon(nr);
        if (t !== suchToken || weg) return;
        const neu = [];
        muster.lastIndex = 0;
        let m;
        while ((m = muster.exec(s.text)) && neu.length < 200) {
          if (!m[0].length) { muster.lastIndex++; continue; }
          const a = m.index, z = a + m[0].length;
          const rechtecke = s.teile.filter(p => p.a < z && p.a + p.n > a).map(p => {
            const s0 = Math.max(0, a - p.a) / p.n, s1 = Math.min(p.n, z - p.a) / p.n;
            return { x: p.x + p.b * s0, y: p.y, b: Math.max(2, p.b * (s1 - s0)), h: p.h };
          });
          const vor = s.anzeige.slice(Math.max(0, a - 40), a), nach = s.anzeige.slice(z, z + 60);
          neu.push({ nr, rechtecke, vor: (a > 40 ? '…' : '') + vor.replace(/\s+/g, ' ').trimStart(), wort: s.anzeige.slice(a, z), nach: nach.replace(/\s+/g, ' ') + (z + 60 < s.anzeige.length ? '…' : ''), i: treffer.length + neu.length });
        }
        if (neu.length) {
          treffer.push(...neu);
          trefferJeSeite.set(nr, neu);
          if (aktuell < 0) { aktuell = 0; }
          if (lw()) lw().plane();
        }
        // Liste wachsen lassen, ohne bei jeder Seite alles neu zu bauen
        if (neu.length || nr === seitenZahl() || nr % 10 === 0) bauSuche(null, nr < seitenZahl() ? nr : 0);
      }
    }
    function bauSuche(hinweis, bisSeite) {
      if (!offen || modus !== 'suche') return;
      const titel = $('[data-sl="titel"]');
      titel.textContent = '';
      const anzahl = $('[data-sl="anzahl"]');
      const seitenMit = trefferJeSeite.size;
      anzahl.textContent = !suchText ? '' : treffer.length ? `${aktuell + 1} von ${treffer.length}${bisSeite ? '+' : ''} · ${seitenMit} ${seitenMit === 1 ? 'Seite' : 'Seiten'}` : bisSeite ? 'Suche …' : 'Keine Treffer';
      aside.querySelectorAll('[data-sl="weiter"], [data-sl="zurueck"]').forEach(k => { k.disabled = treffer.length < 2; });
      if (hinweis) { liste.innerHTML = `<p class="sl-leer">${esc(hinweis)}</p>`; return; }
      if (!suchText) { liste.innerHTML = '<p class="sl-leer">Suche nach Stichwörtern im Text des PDFs. Gross- und Kleinschreibung spielt keine Rolle. Gescannte Seiten ohne Text und deine Handschrift werden nicht durchsucht.</p>'; return; }
      if (!treffer.length) { liste.innerHTML = bisSeite ? `<p class="sl-leer"><span class="kreisel" aria-hidden="true"></span> Seite ${bisSeite} von ${seitenZahl()} …</p>` : `<p class="sl-leer">„${esc(feld.value.trim())}“ kommt im Text dieses PDFs nicht vor.</p>`; return; }
      let html = '', seite = 0;
      for (const h of treffer.slice(0, 500)) {
        if (h.nr !== seite) {
          if (seite) html += '</div>';
          seite = h.nr;
          const ab = abschnittVon(h.nr);
          html += `<div class="sl-gruppe"><div class="sl-gruppe-kopf">Seite ${h.nr}${ab ? ` · ${esc(ab.titel)}` : ''}</div>`;
        }
        html += `<button class="sl-treffer${h.i === aktuell ? ' aktuell' : ''}" type="button" data-treffer="${h.i}">${esc(h.vor)}<mark>${esc(h.wort)}</mark>${esc(h.nach)}</button>`;
      }
      if (seite) html += '</div>';
      if (bisSeite) html += `<p class="sl-leer"><span class="kreisel" aria-hidden="true"></span> Seite ${bisSeite} von ${seitenZahl()} …</p>`;
      if (treffer.length > 500) html += `<p class="sl-leer">Nur die ersten 500 von ${treffer.length} Treffern sind aufgelistet.</p>`;
      const pos = liste.scrollTop;
      liste.innerHTML = html;
      liste.scrollTop = pos;
      if (!inhalt) ladeInhalt().then(() => { if (offen && modus === 'suche' && !bisSeite) bauSuche(); });
    }
    function zeigeTreffer(i) {
      const h = treffer[i];
      if (!h) return;
      aktuell = i;
      const y = h.rechtecke.length ? h.rechtecke[0].y : 0;
      if (lw()) { lw().springeZuSeite(h.nr - 1, true, Math.max(0, y - 120)); lw().plane(); }
      liste.querySelectorAll('.sl-treffer.aktuell').forEach(k => k.classList.remove('aktuell'));
      const k = liste.querySelector(`[data-treffer="${i}"]`);
      if (k) { k.classList.add('aktuell'); k.scrollIntoView({ block: 'nearest' }); }
      const anzahl = $('[data-sl="anzahl"]');
      anzahl.textContent = anzahl.textContent.replace(/^\d+ von/, `${i + 1} von`);
    }
    function springeTreffer(d) {
      if (!treffer.length) return;
      zeigeTreffer(((aktuell < 0 ? -1 : aktuell) + d + treffer.length) % treffer.length);
    }

    /* ----- Auf dem Blatt: Suchtreffer und Lesezeichen-Bändchen (vom Hintergrund der Seite aus gemalt) ----- */

    S.male = (ctx, s) => {
      const liste2 = trefferJeSeite.get(s.nr);
      if (liste2) {
        ctx.save();
        for (const h of liste2) {
          ctx.fillStyle = h.i === aktuell ? 'rgba(255, 128, 0, .5)' : 'rgba(255, 210, 0, .38)';
          for (const r of h.rechtecke) ctx.fillRect(r.x - 1, r.y, r.b + 2, r.h);
        }
        ctx.restore();
      }
      if (lesezeichen().includes(s.nr)) {
        // Bändchen oben rechts, wie ein Lesebändchen, das aus dem Buch hängt
        const b = 20, h = 34, x = s.b - 44;
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, .25)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = BAND;
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x + b, 0); ctx.lineTo(x + b, h); ctx.lineTo(x + b / 2, h - 7); ctx.lineTo(x, h);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    };

    /* ----- Nach aussen ----- */

    S.knoepfe = knoepfe;
    S.oeffne = oeffnen;
    S.setzePdf = p => {
      pdf = p;
      texte.clear();
      inhalt = null; inhaltVersprechen = null;
      if (offen) bauen();
    };
    S.start = () => { if (einst.offen && !offen) oeffnen(einst.reiter); };
    // Neue Seite im Blick: die Leiste folgt (Bild bzw. Abschnitt markieren)
    S.seite = nr => {
      if (!offen) return;
      if (modus === 'seiten') {
        liste.querySelectorAll('.sl-seite.aktuell').forEach(k => k.classList.remove('aktuell'));
        const k = liste.querySelector(`.sl-seite[data-nr="${nr}"]`);
        if (k) { k.classList.add('aktuell'); k.scrollIntoView({ block: 'nearest' }); }
      } else if (modus === 'inhalt' && inhalt) {
        const jetzt = abschnittVon(nr, 1e9), i = jetzt ? inhalt.eintraege.indexOf(jetzt) : -1;
        liste.querySelectorAll('.sl-abschnitt').forEach((k, j) => k.classList.toggle('aktuell', j === i));
      } else if (modus === 'lesezeichen') {
        const k = $('[data-sl="titel"] [data-umschalten]');
        if (!k) return;
        const hat = lesezeichen().includes(nr);
        k.textContent = hat ? `Seite ${nr} entfernen` : `Seite ${nr} merken`;
        k.onclick = () => S.lesezeichen(nr, !hat);
      }
    };
    S.taste = e => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'f' && pdf) { e.preventDefault(); oeffnen('suche'); return true; }
      if (k === 'escape' && offen && modus === 'suche') { schliessen(); return true; }
      return false;
    };
    S.offen = () => offen;
    S.zerstoere = () => {
      weg = true;
      suchToken++;
      clearTimeout(suchTimer);
      if (beobachter) beobachter.disconnect();
      miniSchlange = [];
      aside.remove();
      o.el.classList.remove('sl-offen');
      if (S.anfang) S.anfang.innerHTML = '';
    };
    return S;
  }

  window.Seitenleiste = Seitenleiste;
})();
