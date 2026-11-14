'use strict';
// Skripte und Notizbücher öffnen und darauf schreiben.
// Mehrere Dokumente sind als Tabs offen, zwei lassen sich nebeneinander andocken,
// und jedes kann in ein eigenes Fenster und von dort wieder zurück.
Daten.bereit.then(function () {
  const { $, esc, neueId, meldung, bestaetige, oeffneDialog, knoepfe } = UI;
  const ansicht = $('ansicht-dok');
  const tabLeiste = $('dok-tabs');
  const bereiche = $('dok-bereiche');
  const teiler = $('dok-teiler');
  const vorlage = $('dok-vorlage');
  const leistenSlot = $('dok-leiste');   // hier steht immer genau eine Werkzeugleiste: die des Dokuments, in dem man arbeitet
  const EINHEIT = PdfDienst.EINHEIT;
  const TABS_KEY = 'lokal:dok-tabs';
  const MAX_GELADEN = 6;   // so viele Dokumente bleiben geladen; ältere werden beim Zurückwechseln neu geöffnet

  const einst = Werkzeuge.einstellungen();
  // Nur das Hauptfenster führt die Tabs; ein ausgelagertes Dokument im eigenen Fenster nicht
  const hauptfenster = !/^#\/fenster\//.test(location.hash);
  const kanal = 'BroadcastChannel' in window ? new BroadcastChannel('lernheft-fenster') : null;
  let eigenesFenster = false;

  /* ---------- Kleine Helfer ---------- */

  const SYMBOL_LINKS = '<svg class="menue-symbol" viewBox="0 0 24 24" aria-hidden="true"><rect x="9.5" y="9" width="10" height="12" rx="1.6"/><path d="M15 4.5H9.5a5 5 0 00-5 5V12"/><path d="M2 9.6l2.5 2.6 2.6-2.6"/></svg>';
  const SYMBOL_RECHTS = '<svg class="menue-symbol" viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="9" width="10" height="12" rx="1.6"/><path d="M9 4.5h5.5a5 5 0 015 5V12"/><path d="M16.9 9.6l2.6 2.6 2.5-2.6"/></svg>';
  const SYMBOL_UNDO = '<svg class="menue-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>';
  const SYMBOL_REDO = '<svg class="menue-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/></svg>';

  // Symbole für das Menü ⋯ (Linien wie in der Werkzeugleiste)
  const SYMBOLE = {
    seitePlus: '<path d="M6 3h9l4 4v14H6z"/><path d="M12.5 10.5v6M9.5 13.5h6"/>',
    weg: '<path d="M4 7h16M9.5 7V4h5v3M6.5 7l1 13h9l1-13"/>',
    bild: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 3.5"/>',
    ablage: '<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3.5h6V5M9 11h6M9 15h4"/>',
    pdf: '<path d="M6 3h9l4 4v14H6z"/><path d="M12.5 10v6M10 13.8l2.5 2.4 2.5-2.4"/>',
    brett: '<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M8 20.5l4-4 4 4"/>',
    seiten: '<path d="M8 3h8l3 3v12H8z"/><path d="M5 7v14h10"/>',
    fenster: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9h17"/>',
    daneben: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M12 5v14"/>',
    zu: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    regler: '<path d="M4 7h9M19 7h1M4 12h2M12 12h8M4 17h11"/><circle cx="16" cy="7" r="2.2"/><circle cx="9" cy="12" r="2.2"/><circle cx="18" cy="17" r="2.2"/>',
    gesten: '<path d="M9 11V5.5a1.5 1.5 0 013 0V11"/><path d="M12 10a1.5 1.5 0 013 0v1.5"/><path d="M15 11a1.5 1.5 0 013 0v3.5c0 3.4-2.3 6-5.6 6h-.6c-1.9 0-3.2-.9-4.3-2.4L5.4 15a1.5 1.5 0 012.4-1.8L9 14.6"/>',
    zahnrad: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.6M12 18.4V21M3 12h2.6M18.4 12H21M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9"/>',
    reset: '<path d="M1 4v6h6"/><path d="M3.5 15a9 9 0 102.1-9.4L1 10"/>',
    uhr: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    ordner: '<path d="M3.5 7a2 2 0 012-2h4l2 2.5h7a2 2 0 012 2V17a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/>',
    lesezeichen: '<path d="M7 3.5h10V21l-5-4-5 4z"/>',
    liste: '<path d="M8 7h12M8 12h12M8 17h12M4 7h.5M4 12h.5M4 17h.5"/>',
    zurueck: '<path d="M10 6l-6 6 6 6M4 12h16"/>',
    tauschen: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    links: '<rect x="9.5" y="9" width="10" height="12" rx="1.6"/><path d="M15 4.5H9.5a5 5 0 00-5 5V12"/><path d="M2 9.6l2.5 2.6 2.6-2.6"/>',
    rechts: '<rect x="4.5" y="9" width="10" height="12" rx="1.6"/><path d="M9 4.5h5.5a5 5 0 015 5V12"/><path d="M16.9 9.6l2.6 2.6 2.5-2.6"/>'
  };
  const sym = name => `<svg class="menue-symbol" viewBox="0 0 24 24" aria-hidden="true">${SYMBOLE[name] || ''}</svg>`;

  // Menü an einer Stelle (Bildschirm-Koordinaten), z. B. wo zwei Finger lagen
  function menueBei(x, y, html, aktion) {
    const anker = document.createElement('div');
    Object.assign(anker.style, { position: 'fixed', left: x + 'px', top: y + 'px', width: '1px', height: '1px', pointerEvents: 'none' });
    document.body.appendChild(anker);
    const el = menue(anker, html, aktion);
    anker.remove();
    return el;
  }

  function menue(knopf, html, aktion, klasse) {
    document.querySelectorAll('.kontext').forEach(k => k.remove());
    const el = document.createElement('div');
    el.className = 'kontext' + (klasse ? ' ' + klasse : '');
    el.setAttribute('role', 'menu');
    el.innerHTML = html;
    document.body.appendChild(el);
    const r = knopf.getBoundingClientRect();
    const h = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(r.right - el.offsetWidth, window.innerWidth - el.offsetWidth - 8)) + 'px';
    el.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
    const zu = ev => { if (!el.contains(ev.target)) { el.remove(); document.removeEventListener('pointerdown', zu, true); } };
    setTimeout(() => document.addEventListener('pointerdown', zu, true));
    el.addEventListener('click', ev => {
      const k = ev.target.closest('button');
      if (!k) return;
      el.remove();
      document.removeEventListener('pointerdown', zu, true);
      aktion(k.dataset);
    });
    return el;
  }

  const gueltig = id => { const it = id && Bibliothek.get(id); return !!it && (it.art === 'skript' || it.art === 'notizbuch'); };
  const name = id => { const it = Bibliothek.get(id); return it ? it.name : ''; };
  const istBrett = it => !!it && it.art === 'notizbuch' && it.papier === 'whiteboard';
  const RASTER = { punkte: 'Punktraster', karo: 'Kariert', linien: 'Liniert', blanko: 'Leer' };

  /* ---------- Ein geöffnetes Dokument (ein Bereich mit Kopf, Werkzeugen und Schreibfläche) ---------- */

  function DokFenster(id) {
    const el = vorlage.content.firstElementChild.cloneNode(true);
    // Die Werkzeugleiste gehört zum Dokument, steht aber in der gemeinsamen Ablage oben (leistenSlot), solange das Dokument
    // im Fokus ist: so gibt es nie zwei Leisten, auch nicht bei zwei Dokumenten nebeneinander oder im Vollbild
    const leistenEl = el.querySelector('[data-el="werkzeuge"]');
    const q = n => (n === 'werkzeuge' ? leistenEl : leistenEl.querySelector(`[data-el="${n}"]`) || el.querySelector(`[data-el="${n}"]`));
    const flaeche = q('flaeche');
    const F = { id, el, zuletzt: Date.now() };
    let it = Bibliothek.get(id);
    let lw = null, leiste = null, sl = null, pdf = null, token = 0, sichtbar = false, weg = false, gestartet = false, istVoll = false;
    const cache = new Map();        // Seitennummer -> { canvas (ImageBitmap oder Canvas), massstab, modus }
    // Gerenderte PDF-Seiten liegen als ImageBitmap auf der Grafikkarte. Ein Canvas, aus dem gelesen wird
    // (willReadFrequently), liegt dagegen im Arbeitsspeicher und musste bei jedem Neuzeichnen der Schreibfläche erneut
    // hochgeladen werden: auf dem iPad ruckelte dadurch das Scrollen.
    const gibFrei = bild => { if (!bild) return; if (bild.close) bild.close(); else bild.width = 0; };
    const hellWerte = new Map();    // Seitennummer -> Helligkeit
    let warteschlange = [], rendertLaeuft = false;
    let seiteTimer = 0, ansichtTimer = 0, anzeigeTimer = 0;
    el.hidden = true;
    bereiche.appendChild(el);

    function meldungZeigen(text) {
      q('meldung').hidden = !text;
      q('meldung').textContent = text || '';
    }

    /* ----- Seiten ----- */

    function notizbuchSeiten() {
      const Fm = Leinwand.FORMATE[it.format] || Leinwand.FORMATE.A4;
      // Whiteboard: eine einzige unendliche Fläche (die Seite gibt nur den Ursprung und die Speicherstelle vor)
      const farbe = Leinwand.seitenfarbe(it.seitenfarbe).farbe;
      if (istBrett(it)) return [{ id: (it.seiten || [])[0] || 's1', art: 'brett', b: Fm.b, h: Fm.h, mm: Fm.mm, nr: 1, endlos: true, unendlich: true, raster: it.raster || 'punkte', papierFarbe: farbe }];
      // Jede Seite in ihrem Format: Querformat des Notizbuchs und eigene Drehung (Leinwand.seitenFormat)
      return (it.seiten || []).map((sid, i) => { const f = Leinwand.seitenFormat(it, sid); return { id: sid, art: 'papier', papier: it.papier || 'karo', b: f.b, h: f.h, mm: f.mm, nr: i + 1, papierFarbe: farbe }; });
    }

    // Seite im Blick um 90° drehen (richtung +90 rechts herum, -90 links herum), samt allem, was darauf steht
    function dreheSeite(richtung, nr) {
      if (!lw || istBrett(it)) return;
      const s = lw.seiten()[nr != null && nr >= 0 ? nr : lw.aktuelleSeite()];
      if (!s) return;
      const alt = { b: s.b, h: s.h }, sid = s.id;
      Bibliothek.aendere(id, x => {
        const d = (((Leinwand.drehungVon(x, sid) + richtung) % 360) + 360) % 360;
        const neu = { ...(x.drehung || {}) };
        if (d) neu[sid] = d; else delete neu[sid];
        if (Object.keys(neu).length) x.drehung = neu; else delete x.drehung;
      });
      it = Bibliothek.get(id);
      lw.dreheInhalt(sid, richtung, alt.b, alt.h);
      if (it.art === 'notizbuch') lw.setzeSeiten(notizbuchSeiten());
      else {
        // Skript: nur diese Seite bekommt die vertauschten Masse; ihr altes Bild passt nicht mehr und wird neu gerendert
        lw.setzeSeiten(lw.seiten().map(x => (x.id === sid ? { ...x, b: alt.h, h: alt.b } : x)));
        if (cache.has(s.nr)) { gibFrei(cache.get(s.nr).canvas); cache.delete(s.nr); }
        if (sl) sl.inkGeaendert(s.nr);
      }
      lw.springeZuSeite(lw.seiten().findIndex(x => x.id === sid), false);
      meldung(richtung > 0 ? 'Seite nach rechts gedreht' : 'Seite nach links gedreht');
    }

    // Fläche einer Skriptseite: bestimmt, ob Schwarz als Schwarz oder als Weiss erscheint
    function flaecheSkript(s) {
      const modus = it.modus || 'original';
      if (modus === 'dunkel' || modus === 'dunkelgrau') return 'dunkel';
      if (modus === 'hell') return 'hell';
      const hell = hellWerte.has(s.nr) ? hellWerte.get(s.nr) : (s.nr === 1 && it.hell != null ? it.hell : 1);
      return hell > 0.5 ? 'hell' : 'dunkel';
    }

    /* ----- PDF-Seiten rendern ----- */

    // Halbe Zweierpotenzen, damit beim Zoomen nicht ständig neu gerendert wird
    const stufe = massstab => Math.pow(2, Math.ceil(Math.log2(Math.max(0.25, massstab)) * 2) / 2);
    const maxMassstab = s => Math.sqrt(12e6 / (s.b * s.h));

    // aus: der Ausschnitt der Seite, der gerade gemalt wird (eine Kachel der Schreibfläche)
    function hintergrund(ctx, s, massstab, aus) {
      const e = cache.get(s.nr);
      const ziel = stufe(massstab), dreh = Leinwand.drehungVon(it, 'p' + s.nr);
      if (!e || e.modus !== it.modus || e.dreh !== dreh || e.massstab < ziel * 0.99 && e.massstab < maxMassstab(s)) anfordern(s, ziel);
      // Ein Bild in der alten Drehung wäre verzerrt: dann lieber kurz das leere Blatt
      if (!e || e.dreh !== dreh) return false;
      // Nur der Teil des Bildes, den der Ausschnitt braucht (mit etwas Rand, damit an den Kanten nichts fehlt). Verkleinert
      // wird höchstens auf gut die Hälfte (stufe): dafür reicht die mittlere Güte, die in Safari viel schneller ist als die
      // hohe; nur bei starkem Verkleinern (grobes Bild, weit herausgezoomt) die hohe.
      const B = e.canvas.width, H = e.canvas.height, fx = B / s.b, fy = H / s.h;
      ctx.imageSmoothingQuality = fx > massstab * 2.2 ? 'high' : 'medium';
      if (aus) {
        const sx = Math.max(0, Math.floor(aus.x1 * fx) - 2), sy = Math.max(0, Math.floor(aus.y1 * fy) - 2);
        const sx2 = Math.min(B, Math.ceil(aus.x2 * fx) + 2), sy2 = Math.min(H, Math.ceil(aus.y2 * fy) + 2);
        if (sx2 > sx && sy2 > sy) ctx.drawImage(e.canvas, sx, sy, sx2 - sx, sy2 - sy, sx / fx, sy / fy, (sx2 - sx) / fx, (sy2 - sy) / fy);
      } else ctx.drawImage(e.canvas, 0, 0, s.b, s.h);
      if (sl) sl.male(ctx, s);   // Suchtreffer und Lesezeichen-Bändchen
      return true;
    }

    // pdf.js rendert auf demselben Thread, der auch das Scrollen zeichnet (bis zu 15 ms je Bild). Deshalb bekommt eine
    // Seite, von der es noch gar kein Bild gibt, zuerst schnell ein grobes (VORAB, etwa ein Zehntel der Pixel), damit beim
    // Scrollen nie eine leere Seite steht. Die scharfen Bilder warten, bis die Fläche ruhig ist (lw.inBewegung).
    const VORAB = 0.6;
    const warte = ms => new Promise(ok => setTimeout(ok, ms));
    function anfordern(s, massstab) {
      if (!sichtbar) return;
      const ziel = Math.min(massstab, maxMassstab(s));
      if (!cache.has(s.nr) && ziel > VORAB * 1.4 && !warteschlange.some(w => w.nr === s.nr && w.vorab)) warteschlange.push({ nr: s.nr, massstab: VORAB, s, vorab: true });
      const vorhanden = warteschlange.find(w => w.nr === s.nr && !w.vorab);
      if (vorhanden) vorhanden.massstab = ziel;
      else warteschlange.push({ nr: s.nr, massstab: ziel, s });
      if (!rendertLaeuft) rendereNaechste();
    }

    async function rendereNaechste() {
      const t = token;
      rendertLaeuft = true;
      while (warteschlange.length && t === token && pdf) {
        // Grobe Bilder zuerst, dann die Seite, die gerade am nächsten liegt
        const aktuelle = lw ? lw.aktuelleSeite() + 1 : 1;
        warteschlange.sort((a, b) => ((b.vorab ? 1 : 0) - (a.vorab ? 1 : 0)) || Math.abs(a.nr - aktuelle) - Math.abs(b.nr - aktuelle));
        if (!warteschlange[0].vorab && lw && lw.inBewegung && lw.inBewegung()) { await warte(90); continue; }
        const w = warteschlange.shift();
        // Ein grobes Bild ist überflüssig, wenn inzwischen ein besseres (in derselben Drehung) da ist
        const besser = () => cache.has(w.nr) && cache.get(w.nr).massstab >= w.massstab && cache.get(w.nr).dreh === Leinwand.drehungVon(it, 'p' + w.nr);
        if (w.vorab && besser()) continue;
        try {
          const seite = await pdf.getPage(w.nr);
          if (t !== token) break;
          const dreh = Leinwand.drehungVon(it, 'p' + w.nr);
          const vp = Leinwand.pdfAnsicht(seite, EINHEIT * w.massstab, it, w.nr);
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.floor(vp.width));
          c.height = Math.max(1, Math.floor(vp.height));
          const modus = it.modus || 'original';
          // Lesen müssen nur die Modi, die umfärben (helligkeit liest aus einer kleinen Kopie)
          const cx = c.getContext('2d', modus === 'original' ? undefined : { willReadFrequently: true });
          cx.fillStyle = '#fff';
          cx.fillRect(0, 0, c.width, c.height);
          const aufgabe = seite.render({ canvasContext: cx, viewport: vp });
          // pdf.js malt auf demselben Thread in Häppchen von bis zu 15 ms. Ein scharfes Bild, das schon begonnen ist,
          // hält zwischen zwei Häppchen an, solange gescrollt oder gezoomt wird, und macht weiter, wenn die Fläche ruht
          // (vorher lief es durch und nahm dem Scrollen die Bilder weg). Grobe Bilder laufen durch, sie sind klein.
          if (!w.vorab) aufgabe.onContinue = weiter => {
            const los = () => { if (t === token && lw && lw.inBewegung && lw.inBewegung()) setTimeout(los, 70); else weiter(); };
            los();
          };
          await aufgabe.promise;
          if (t !== token || !sichtbar) { c.width = 0; continue; }
          const hell = PdfDienst.helligkeit(c);
          hellWerte.set(w.nr, hell);
          if (PdfDienst.umfaerbenNoetig(modus, hell)) PdfDienst.umfaerben(c, modus);
          let bild = c;
          if (window.createImageBitmap) {
            try { bild = await createImageBitmap(c); c.width = 0; } catch (e) { bild = c; }
          }
          if (t !== token || !sichtbar || (w.vorab && besser()) || dreh !== Leinwand.drehungVon(it, 'p' + w.nr)) { gibFrei(bild); continue; }
          gibFrei(cache.has(w.nr) ? cache.get(w.nr).canvas : null);
          cache.set(w.nr, { canvas: bild, massstab: w.massstab, modus, dreh });
          aufraeumen();
          // Nur diese Seite neu malen, nicht die ganze Fläche
          if (lw) { if (lw.planeSeite) lw.planeSeite(w.nr); else lw.plane(); }
        } catch (e) { /* abgebrochen oder kaputte Seite */ }
      }
      rendertLaeuft = false;
    }

    // Weit entfernte Seiten wieder freigeben, sonst wird es bei dicken Skripten eng (auf dem iPad schon bei wenigen Seiten)
    function aufraeumen() {
      if (!lw) return;
      const jetzt = lw.aktuelleSeite() + 1;
      for (const [nr, e] of cache) if (Math.abs(nr - jetzt) > 4) { gibFrei(e.canvas); cache.delete(nr); }
    }
    function freigeben() {
      warteschlange = [];
      for (const e of cache.values()) gibFrei(e.canvas);
      cache.clear();
    }

    /* ----- Öffnen ----- */

    function kopfFuellen() { el.dataset.art = it.art; }

    // Am Ende der Werkzeugleiste: Seitenzahl, Lernzeit, Vollbild und ⋯ (Seiten, Ordner, Exportieren, Fenster)
    function leistenEnde() {
      leiste.ende.innerHTML = `
        <button data-el="leiste-zu" class="wz" type="button" title="Werkzeugleiste einklappen" aria-label="Werkzeugleiste einklappen" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path class="auf" d="M6 15l6-6 6 6"/><path class="zu" d="M6 9l6 6 6-6"/></svg>
        </button>
        <span data-el="seite" class="pdf-seite"></span>
        <button data-el="zeit" class="btn-leise nur-zeit" type="button" title="Lernzeit ansehen">⏱ 0 min</button>
        <button data-el="vollbild" class="wz" type="button" title="Vollbild: nur das Blatt" aria-label="Vollbild" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path class="auf" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><path class="zu" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>
        </button>
        <button data-el="mehr" class="wz" type="button" title="Seiten, Ordner, Exportieren, Fenster" aria-label="Mehr">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.6" class="voll"/><circle cx="12" cy="12" r="1.6" class="voll"/><circle cx="18.5" cy="12" r="1.6" class="voll"/></svg>
        </button>`;
      q('leiste-zu').addEventListener('click', () => { const an = !q('werkzeuge').classList.contains('leiste-zu'); Daten.set('lokal:leiste-zu', an); setzeLeisteZu(an); });
      setzeLeisteZu(Daten.get('lokal:leiste-zu', false));
      q('zeit').addEventListener('click', () => Bibliothek.zeigeStatistik(id));
      q('vollbild').addEventListener('click', () => vollbild(!voll));
      q('mehr').addEventListener('click', e => mehrMenue(e.currentTarget));
      zeigeZeit();
    }

    // Werkzeugleiste einklappen: bleibt nur ein kleiner Knopf, die Schreibfläche bekommt den ganzen Platz
    function setzeLeisteZu(an) {
      const k = q('leiste-zu');
      q('werkzeuge').classList.toggle('leiste-zu', !!an);
      if (!k) return;
      k.setAttribute('aria-pressed', String(!!an));
      k.title = k.ariaLabel = an ? 'Werkzeugleiste ausklappen' : 'Werkzeugleiste einklappen';
    }

    async function laden() {
      const t = ++token;
      kopfFuellen();
      Bibliothek.aendere(id, x => { x.geoeffnet = Date.now(); });
      Zeit.sitzung(id);
      // Die Handschrift dieses Dokuments holen (sie liegt nicht von Anfang an im Speicher, siehe daten.js)
      const alleDa = await Daten.lade(Daten.keys('ink:' + id + ':'));
      if (t !== token || weg) return;
      if (!alleDa) meldung('Einige Seiten kommen noch aus der Cloud und erscheinen, sobald sie da sind.');

      lw = Leinwand(flaeche, {
        einst,
        einstGeaendert: Werkzeuge.speichereEinst,
        ladeInk: sid => Daten.get('ink:' + id + ':' + sid, { e: [] }),
        speichereInk: (sid, inhalt) => {
          const k = 'ink:' + id + ':' + sid;
          // Eine Seite ohne Striche, aber mit Grabsteinen bleibt: sonst käme Gelöschtes vom anderen Gerät zurück
          if (inhalt.e.length || (inhalt.x && Object.keys(inhalt.x).length)) Daten.set(k, inhalt); else Daten.del(k);
          if (sl) sl.inkGeaendert(Number(sid.slice(1)));
        },
        hintergrund,
        dreheSeite: istBrett(it) ? null : dreheSeite,
        flaeche: s => (it.art === 'skript' ? flaecheSkript(s) : Leinwand.seitenfarbe(it.seitenfarbe).flaeche || Leinwand.flaecheThema()),
        // Rechtsklick, Finger oder zwei Finger lange halten: Menü der Seite
        kontextMenue: o => seitenKontext(o),
        // Neue Seite: per Knopf oder durch Wischen über das Ende hinaus (sofort: ohne Sprung zur neuen Seite)
        neueSeite: it.art === 'notizbuch' && !istBrett(it) ? o => seiteEinfuegen(it.seiten.length, !!(o && o.sofort)) : null,
        // Notizbuch: nur auf dem Blatt schreiben, drumherum kein Raster; Whiteboard: unendliche Fläche
        begrenzt: it.art === 'notizbuch' && !istBrett(it),
        unendlich: istBrett(it),
        raster: () => it.raster || 'punkte',
        randAnteil: it.art === 'notizbuch' ? 0.03 : 0.09,
        maxEinpassen: it.art === 'notizbuch' ? 1.5 : 1.3,
        hinweis: istBrett(it) ? 'Stift schreibt · ein Finger verschiebt · zwei Finger zoomen · 0 zeigt alles' : undefined,
        stifttasteTest: () => leiste && leiste.tastenOffen()
      });
      if (istVoll) lw.setzeVollbild(true);
      lw.aktiv(sichtbar);
      leiste = Werkzeuge.baue(q('werkzeuge'), lw);
      leistenEnde();
      // Skript: ganz links in der Leiste Seitenleiste (Seiten, Inhalt, Lesezeichen) und Suche im PDF
      if (it.art === 'skript') {
        sl = Seitenleiste({ el, id, item: () => it, lw: () => lw, aendere: fn => { Bibliothek.aendere(id, fn); it = Bibliothek.get(id); } });
        sl.knoepfe(leiste.anfang);
      }
      lw.on('seite', i => {
        const n = lw.seiten().length;
        if (istBrett(it)) { q('seite').textContent = ''; q('seite').title = ''; return; }
        q('seite').textContent = `${i + 1} / ${n}`;
        q('seite').title = `Seite ${i + 1} von ${n}`;
        if (sl) sl.seite(i + 1);
        clearTimeout(seiteTimer);
        seiteTimer = setTimeout(() => { if (!weg) Bibliothek.aendere(id, x => { if (x.seite !== i + 1) x.seite = i + 1; }); }, 2000);
        aufraeumen();
      });
      lw.on('ansicht', merkeAnsicht);
      // Gesten, die über die Schreibfläche hinausgehen (L.geste)
      lw.on('geste', g => {
        if (g.was === 'vollbild') vollbild(!voll);
        else if (g.was === 'leiste') { const an = !q('werkzeuge').classList.contains('leiste-zu'); Daten.set('lokal:leiste-zu', an); setzeLeisteZu(an); }
        else if (g.was === 'eigenschaften') { if (leiste && leiste.zeigeEigenschaften) leiste.zeigeEigenschaften(); }
        else if (g.was === 'palette') { if (leiste && leiste.zeigePalette) leiste.zeigePalette(g.pos); }
        else if (g.was === 'seite') seitenMenue(g.pos);
      });
      // Seitenanzeige unten links, nur beim Scrollen
      lw.on('bewegt', () => {
        const n = lw.seiten().length;
        if (istBrett(it) || n < 1 || !sichtbar) return;
        const z = q('seitenanzeige'), text = `${lw.aktuelleSeite() + 1} von ${n}`;
        // Nur ändern, was sich ändert: das läuft bei jedem Bild des Scrollens
        if (z.textContent !== text) z.textContent = text;
        if (!z.classList.contains('da')) z.classList.add('da');
        clearTimeout(anzeigeTimer);
        anzeigeTimer = setTimeout(() => z.classList.remove('da'), 1300);
      });

      if (it.art === 'notizbuch') {
        lw.setzeSeiten(notizbuchSeiten(), true);
        startAnsicht();
        return;
      }

      // Skript: PDF laden
      meldungZeigen('PDF wird geladen …');
      try {
        const blob = await Daten.datei.get('pdf:' + it.datei);
        if (t !== token) return;
        if (!blob) throw new Error('Die PDF zu diesem Skript wurde im Ordner nicht gefunden. Lege sie wieder in den Ordner des Skripts (Rechtsklick in der Bibliothek, „Im Ordner zeigen“).');
        const geladen = await PdfDienst.oeffnePdf(new Uint8Array(await blob.arrayBuffer()));
        if (t !== token) { geladen.destroy(); return; }
        pdf = geladen;
        // Seitengrössen: erst alle wie Seite 1, dann genau
        const v1 = Leinwand.pdfAnsicht(await pdf.getPage(1), EINHEIT, it, 1);
        if (t !== token) return;
        const seiten = [];
        for (let nr = 1; nr <= pdf.numPages; nr++) seiten.push({ id: 'p' + nr, art: 'pdf', b: v1.width, h: v1.height, nr });
        lw.setzeSeiten(seiten, true);
        meldungZeigen('');
        startAnsicht();
        if (sl) { sl.setzePdf(pdf); sl.start(); }
        if (it.seiten !== pdf.numPages) Bibliothek.aendere(id, x => { x.seiten = pdf.numPages; });
        let anders = false;
        for (let nr = 2; nr <= pdf.numPages; nr++) {
          const v = Leinwand.pdfAnsicht(await pdf.getPage(nr), EINHEIT, it, nr);
          if (t !== token) return;
          if (Math.abs(v.width - seiten[nr - 1].b) > 0.5 || Math.abs(v.height - seiten[nr - 1].h) > 0.5) { seiten[nr - 1].b = v.width; seiten[nr - 1].h = v.height; anders = true; }
        }
        if (anders) { const a = lw.merkAnsicht(); lw.setzeSeiten(seiten); lw.setzeAnsicht(a); }
        // Fehlt das Vorschaubild (z. B. im Explorer hinzugefügt), jetzt erzeugen
        const datei = it.datei;
        if (!(await Daten.datei.lokal('vorschau:' + datei)) && t === token) {
          const v = await PdfDienst.vorschauErstellen(pdf);
          await Daten.datei.put('vorschau:' + datei, new Blob([v.bild], { type: 'text/plain' }));
        }
      } catch (e) {
        if (t === token) meldungZeigen(e.message || 'Das PDF konnte nicht geöffnet werden.');
      }
    }

    // Wo man zuletzt war, merkt sich jedes Gerät selbst
    function merkeJetzt() { if (lw) Daten.set('lokal:ansicht:' + id, lw.merkAnsicht()); }
    function merkeAnsicht() {
      clearTimeout(ansichtTimer);
      ansichtTimer = setTimeout(() => { if (!weg) merkeJetzt(); }, 600);
    }
    flaeche.addEventListener('pointerup', merkeAnsicht);
    flaeche.addEventListener('wheel', merkeAnsicht, { passive: true });

    function startAnsicht() {
      const gemerkt = Daten.get('lokal:ansicht:' + id);
      if (gemerkt) lw.setzeAnsicht(gemerkt);
      else if (it.seite > 1) lw.springeZuSeite(it.seite - 1);
    }

    /* ----- Notizbuch-Seiten ----- */

    // sofort: die Seite kam durch Wischen über das Ende hinaus, die Ansicht bleibt, wo sie ist (die neue Seite liegt
    // direkt darunter); sonst scrollt die Ansicht weich zur neuen Seite
    function seiteEinfuegen(pos, sofort) {
      const neu = neueId();
      Bibliothek.aendere(id, x => { x.seiten = (x.seiten || []).slice(); x.seiten.splice(pos, 0, neu); });
      it = Bibliothek.get(id);
      lw.setzeSeiten(notizbuchSeiten());
      if (!sofort) lw.springeZuSeite(pos, true);
    }
    async function seiteLoeschen(pos) {
      if ((it.seiten || []).length <= 1) { meldung('Ein Notizbuch braucht mindestens eine Seite.'); return; }
      const sid = it.seiten[pos];
      const hatInhalt = (Daten.get('ink:' + id + ':' + sid, { e: [] }).e || []).length;
      if (hatInhalt && !await bestaetige('Seite löschen?', `Seite ${pos + 1} und alles darauf wird gelöscht.`, 'Löschen')) return;
      Bibliothek.aendere(id, x => { x.seiten = x.seiten.filter(s => s !== sid); });
      Daten.del('ink:' + id + ':' + sid);
      it = Bibliothek.get(id);
      lw.setzeSeiten(notizbuchSeiten());
    }

    // ⋯ in der Werkzeugleiste: alles, was nicht zum Schreiben gehört, an einem Ort
    // Seiten-Menü (Geste "zwei Finger halten" und Pencil): Seite drehen, Gesten und Leiste einstellen
    // Zwei Finger halten: dasselbe Menü wie Rechtsklick an der Stelle der Finger
    function seitenMenue(pos) {
      if (!lw) return;
      lw.kontextBei(pos[0], pos[1]);
    }
    // Menü an einer Stelle der Seite (Rechtsklick, Finger lange halten, zwei Finger halten): alles, was man dort mit der
    // Seite tun kann. o = { x, y (Bildschirm), nr (Seite unter dem Zeiger), wo (Stelle im Dokument), maus }
    function seitenKontext(o) {
      if (!lw) return;
      const nr = o.nr >= 0 ? o.nr : lw.aktuelleSeite(), n = nr + 1, brett = istBrett(it);
      const teile = [];
      teile.push(`<div class="kontext-titel">${brett ? 'Whiteboard' : `Seite ${n}`}</div>
        <button type="button" data-a="undo" ${lw.kannRueckgaengig() ? '' : 'disabled'}>${SYMBOL_UNDO} Rückgängig</button>
        <button type="button" data-a="redo" ${lw.kannWiederholen() ? '' : 'disabled'}>${SYMBOL_REDO} Wiederholen</button>
        <button type="button" data-a="palette">Palette: Werkzeuge, Farben, Grössen</button>`);
      teile.push(`<div class="kontext-titel">Einfügen</div>
        <button type="button" data-bild="datei">${o.maus ? 'Bild vom Computer …' : 'Bild aus Fotos oder Dateien …'}</button>
        <button type="button" data-bild="ablage">Bild aus der Zwischenablage</button>`);
      if (!brett) {
        teile.push(`<div class="kontext-titel">Seite ${n} drehen</div>
          <button type="button" data-dreh="-90">${SYMBOL_LINKS} Nach links drehen</button>
          <button type="button" data-dreh="90">${SYMBOL_RECHTS} Nach rechts drehen</button>`);
      }
      if (it.art === 'notizbuch' && !brett) {
        teile.push(`<div class="kontext-titel">Seiten</div>
          <button type="button" data-a="danach">Neue Seite nach Seite ${n}</button>
          <button type="button" data-a="davor">Neue Seite vor Seite ${n}</button>
          <button type="button" data-png="seite">Seite ${n} als PNG exportieren</button>
          <button type="button" data-a="loeschen" class="gefahr">Seite ${n} löschen</button>`);
      } else if (it.art === 'skript') {
        const lz = sl && sl.istLesezeichen(n);
        teile.push(`<div class="kontext-titel">Lesezeichen</div>
          <button type="button" data-a="lesezeichen">${lz ? `Lesezeichen von Seite ${n} entfernen` : `Lesezeichen auf Seite ${n} setzen`}</button>
          <button type="button" data-png="seite">Seite ${n} als PNG exportieren</button>`);
      }
      teile.push(`<div class="kontext-titel">Einstellen</div>
        <button type="button" data-a="gesten">Gesten einstellen …</button>
        <button type="button" data-a="anpassen">Werkzeugleiste anpassen …</button>`);
      menueBei(o.x, o.y, teile.join(''), d => {
        if (d.dreh) dreheSeite(Number(d.dreh), nr);
        // Dateiauswahl und Zwischenablage brauchen das Tippen selbst: direkt aus dem Klick heraus starten
        else if (d.bild === 'datei') lw.bildAusDatei(o.wo);
        else if (d.bild === 'ablage') lw.bildAusAblage(o.wo);
        else if (d.a === 'undo') lw.rueckgaengig();
        else if (d.a === 'redo') lw.wiederholen();
        else if (d.a === 'danach') seiteEinfuegen(nr + 1);
        else if (d.a === 'davor') seiteEinfuegen(nr);
        else if (d.a === 'loeschen') seiteLoeschen(nr);
        else if (d.a === 'lesezeichen' && sl) sl.lesezeichen(n, !sl.istLesezeichen(n));
        else if (d.png) Bibliothek.exportiere(id, 'png', { seite: nr });
        else if (d.a === 'gesten' && leiste && leiste.oeffneGesten) leiste.oeffneGesten();
        else if (d.a === 'anpassen' && leiste && leiste.anpassen) leiste.anpassen();
        else if (d.a === 'palette' && leiste && leiste.zeigePalette) { const r = lw.el.getBoundingClientRect(); leiste.zeigePalette([o.x - r.left, o.y - r.top]); }
      });
    }

    // ⋯ in der Werkzeugleiste: alles, was nicht zum Schreiben gehört, an einem Ort. Ein breites Feld mit Gruppen in
    // Spalten (statt einer Liste, die länger war als der Bildschirm): Aktionen mit Symbol, Auswahlen (Papier,
    // Seitenfarbe, Darstellung, Raster) als Reihe von Plättchen, das Gewählte ist hervorgehoben.
    function mehrMenue(knopf) {
      if (!lw) return;
      const pos = lw.aktuelleSeite(), n = pos + 1, brett = istBrett(it);
      const s = sym, akt = (daten, symbol, text, extra) => `<button type="button" ${daten}${extra || ''}>${s(symbol)}<span>${text}</span></button>`;
      const wahl = (attr, werte, jetzt) => `<div class="mehr-wahl" role="group">${werte.map(([w, name]) => `<button type="button" role="menuitemradio" aria-checked="${jetzt === w}" data-${attr}="${w}">${esc(name)}</button>`).join('')}</div>`;
      const teil = (titel, inhalt) => `<section class="mehr-teil"><div class="kontext-titel">${titel}</div>${inhalt}</section>`;
      const drehen = `<div class="mehr-reihe"><span>Drehen</span>${akt('data-dreh="-90"', 'links', 'Links', ` title="Seite ${n} nach links drehen (90°)"`)}${akt('data-dreh="90"', 'rechts', 'Rechts', ` title="Seite ${n} nach rechts drehen (90°)"`)}</div>`;
      const teile = [];
      if (brett) {
        teile.push(teil('Raster', wahl('raster', Object.entries(RASTER), it.raster || 'punkte')));
      } else if (it.art === 'notizbuch') {
        teile.push(teil(`Seiten · Seite ${n}`,
          akt('data-a="danach"', 'seitePlus', 'Neue Seite danach') +
          akt('data-a="davor"', 'seitePlus', 'Neue Seite davor') +
          akt('data-a="ende"', 'seitePlus', 'Neue Seite am Ende') +
          drehen +
          akt('data-a="loeschen"', 'weg', `Seite ${n} löschen`, ' class="gefahr"')));
        teile.push(teil('Papier', wahl('papier', Object.entries(Bibliothek.PAPIERE), it.papier)));
      } else {
        const lz = sl && sl.istLesezeichen(n);
        teile.push(teil(`Seite ${n}`,
          akt('data-a="lesezeichen"', 'lesezeichen', lz ? 'Lesezeichen entfernen' : 'Lesezeichen setzen') +
          akt('data-a="alle-lesezeichen"', 'liste', 'Alle Lesezeichen zeigen') +
          (sl && sl.herkunft() ? akt('data-a="zurueck"', 'zurueck', `Zurück zu Seite ${sl.herkunft()}`) : '') +
          drehen));
        teile.push(teil('Darstellung', wahl('modus', [['original', 'Original'], ['hell', 'Weiss'], ['dunkelgrau', 'Dunkelgrau'], ['dunkel', 'Dunkelblau']], it.modus || 'original')));
      }
      // Seitenfarbe für Notizbuch und Whiteboard
      if (it.art === 'notizbuch') teile.push(teil('Seitenfarbe', wahl('sfarbe', Object.entries(Bibliothek.SEITENFARBEN), it.seitenfarbe || 'auto')));
      // Bild einfügen (auch: Finger lange auf die Fläche halten, Rechtsklick, Strg+V, Datei auf die Fläche ziehen)
      teile.push(teil('Einfügen',
        akt('data-bild="datei"', 'bild', window.matchMedia && !matchMedia('(any-hover: hover)').matches ? 'Foto oder Bilddatei …' : 'Bild vom Computer …') +
        akt('data-bild="ablage"', 'ablage', 'Aus der Zwischenablage')));
      const mehrere = !brett && lw.seiten().length > 1;
      teile.push(teil('Exportieren',
        (it.art === 'skript'
          ? akt('data-x="notizen-blatt"', 'pdf', 'PDF mit Notizen auf dem Skript', ' title="Nur was auf den Seiten des Skripts geschrieben ist"') +
            akt('data-x="notizen"', 'pdf', 'PDF mit allen Notizen (auch daneben)', ' title="Auch was neben den Seiten steht: die Seiten werden dafür grösser"') +
            akt('data-x="original"', 'pdf', 'Original-PDF')
          : akt('data-x="hell"', 'pdf', 'PDF weiss (zum Drucken)') + akt('data-x="dunkel"', 'pdf', 'PDF dunkelblau')) +
        (brett ? akt('data-png="brett"', 'bild', 'PNG vom ganzen Whiteboard')
          : akt('data-png="seite"', 'bild', `PNG von Seite ${n}`) + (mehrere ? akt('data-png="alle"', 'bild', 'PNG aller Seiten') : '')) +
        (brett ? akt('data-u="seiten"', 'seiten', 'Als Seiten kopieren …') : akt('data-u="brett"', 'brett', 'Als Whiteboard kopieren'))));
      teile.push(teil('Einstellen',
        akt('data-a="anpassen"', 'regler', 'Leiste anpassen …') +
        akt('data-a="gesten"', 'gesten', 'Gesten einstellen …') +
        akt('data-a="einst"', 'zahnrad', 'Alle Einstellungen …') +
        akt('data-a="leistereset"', 'reset', 'Symbole zurücksetzen', ' title="Reihenfolge der Symbole in der Leiste zurücksetzen. "Die Symbole lassen sich in der Leiste mit gedrückter Maus, Stift oder Finger ziehen und umsortieren"') +
        (Zeit.sichtbar() ? akt('data-a="zeit"', 'uhr', 'Lernzeit ansehen') : '') +
        (window.lernheftDesktop && window.lernheftDesktop.oeffneOrdner ? akt('data-a="ordner"', 'ordner', 'Ordner öffnen') : '')));
      fensterTeile(id).forEach(([titel, inhalt, zu]) => teile.push(zu
        ? `<details class="mehr-teil mehr-zu"><summary class="kontext-titel">${titel}</summary>${inhalt}</details>`
        : teil(titel, inhalt)));
      menue(knopf, `<div class="mehr-spalten">${teile.join('')}</div>`, d => {
        if (d.dreh) dreheSeite(Number(d.dreh));
        else if (d.a === 'anpassen' && leiste.anpassen) leiste.anpassen();
        else if (d.a === 'gesten' && leiste.oeffneGesten) leiste.oeffneGesten();
        else if (d.a === 'danach') seiteEinfuegen(pos + 1);
        else if (d.a === 'davor') seiteEinfuegen(pos);
        else if (d.a === 'ende') seiteEinfuegen(it.seiten.length);
        else if (d.a === 'loeschen') seiteLoeschen(pos);
        else if (d.a === 'lesezeichen' && sl) sl.lesezeichen(pos + 1, !sl.istLesezeichen(pos + 1));
        else if (d.a === 'alle-lesezeichen' && sl) sl.oeffne('lesezeichen');
        else if (d.a === 'zurueck' && sl) sl.zurueck();
        else if (d.a === 'einst') { if (window.Einstellungen) Einstellungen.zeige(); }
        else if (d.papier) { Bibliothek.aendere(id, x => { x.papier = d.papier; }); it = Bibliothek.get(id); lw.setzeSeiten(notizbuchSeiten()); }
        else if (d.sfarbe) { Bibliothek.aendere(id, x => { if (d.sfarbe === 'auto') delete x.seitenfarbe; else x.seitenfarbe = d.sfarbe; }); it = Bibliothek.get(id); lw.setzeSeiten(notizbuchSeiten()); lw.plane(); }
        else if (d.raster) { Bibliothek.aendere(id, x => { x.raster = d.raster; }); it = Bibliothek.get(id); lw.setzeSeiten(notizbuchSeiten()); lw.plane(); }
        else if (d.bild === 'datei') lw.bildAusDatei();
        else if (d.bild === 'ablage') lw.bildAusAblage();
        else if (d.png) Bibliothek.exportiere(id, 'png', d.png === 'seite' ? { seite: pos } : {});
        else if (d.a === 'leistereset') { leiste.reihenfolgeZuruecksetzen(); meldung('Reihenfolge zurückgesetzt. Tipp: Symbole in der Leiste lassen sich ziehen und umsortieren.'); }
        else if (d.u) { lw.sichern(); Umwandeln[d.u === 'brett' ? 'seitenZuBrett' : 'brettZuSeiten'](id); }
        else if (d.modus) {
          Bibliothek.aendere(id, x => { x.modus = d.modus; });
          it = Bibliothek.get(id);
          Daten.set('lokal:pdf-modus', d.modus);
          lw.plane();
        }
        else if (d.x) Bibliothek.exportiere(id, d.x);
        else if (d.a === 'ordner') window.lernheftDesktop.oeffneOrdner(id);
        else if (d.a === 'zeit') Bibliothek.zeigeStatistik(id);
        else fensterAktion(d, id);
      }, 'mehr');
    }

    // Wer hier tippt oder schreibt, arbeitet in diesem Bereich
    el.addEventListener('pointerdown', () => fokussiere(id), true);

    function zeigeZeit() { const k = q('zeit'); if (k) k.textContent = '⏱ ' + Zeit.text(Zeit.dokZeit(id).sekunden); }

    /* ----- Nach aussen ----- */

    F.zeige = an => {
      if (weg || an === sichtbar) return;
      sichtbar = an;
      el.hidden = !an;
      // Erst laden, wenn der Bereich zu sehen ist: die Schreibfläche braucht ihre Grösse
      if (an && !gestartet) { gestartet = true; F.zuletzt = Date.now(); laden(); return; }
      if (an) { F.zuletzt = Date.now(); if (lw) { setzeLeisteZu(Daten.get('lokal:leiste-zu', false)); lw.aktiv(true); lw.groesse(); lw.plane(); } }
      else {
        merkeJetzt();
        if (leiste) leiste.schliesseTasten();
        if (lw) lw.aktiv(false);
        freigeben();
      }
    };
    F.fokus = an => { el.classList.toggle('fokus', an); };
    // slot: die Leiste in die gemeinsame Ablage stellen; null: zurück ins eigene Dokument, ausgeblendet
    F.leiste = slot => {
      if (weg) return;
      if (slot) { if (leistenEl.parentNode !== slot) slot.appendChild(leistenEl); leistenEl.hidden = false; }
      else { if (leistenEl.parentNode !== el) el.insertBefore(leistenEl, el.firstChild); leistenEl.hidden = true; }
    };
    F.vollbild = an => {
      istVoll = !!an;
      el.classList.toggle('voll', an);
      if (lw) lw.setzeVollbild(an);
      const k = q('vollbild');
      if (k) { k.setAttribute('aria-pressed', String(an)); k.title = an ? 'Vollbild beenden (Esc)' : 'Vollbild: nur das Blatt'; }
      if (!an && leiste) leiste.schliesseEigenschaften();
    };
    F.leinwand = () => lw;
    // Stift-Panel (Druck, Neigung, Tasten, Diagnose) öffnen, z. B. aus den Einstellungen
    F.stiftPanel = () => { const k = q('werkzeuge').querySelector('[data-aktion="tasten"]'); if (k && k.getAttribute('aria-pressed') !== 'true') k.click(); return !!k; };
    F.taste = e => (sl && sl.taste(e)) || (lw ? lw.taste(e) : false);
    F.zeigeZeit = zeigeZeit;
    F.name = () => (it ? it.name : '');
    F.zerstoere = () => {
      if (weg) return;
      merkeJetzt();
      weg = true;
      token++;
      clearTimeout(seiteTimer); clearTimeout(ansichtTimer); clearTimeout(anzeigeTimer);
      freigeben();
      if (pdf) { pdf.destroy(); pdf = null; }
      if (sl) sl.zerstoere();
      if (leiste) leiste.zerstoere();
      if (lw) lw.zerstoere();
      lw = null; leiste = null; sl = null;
      leistenEl.remove();
      el.remove();
      // Handschrift wieder freigeben: erst alles an die Ablage geben, dann aus dem Speicher nehmen
      Daten.flush();
      Daten.vergiss(Daten.keys('ink:' + id + ':'));
    };
    // Änderungen von aussen (anderes Fenster, Explorer)
    F.extern = ({ key, quelle }) => {
      if (weg || !lw || quelle === 'lokal') return;
      if (key.startsWith('ink:' + id + ':')) {
        const sid = key.slice(('ink:' + id + ':').length);
        // Von aussen geändert und noch nicht im Speicher: erst holen, dann zusammenführen
        Daten.lade([key]).then(() => {
          if (weg || !lw) return;
          lw.neuLaden(sid);
          if (sl) sl.inkGeaendert(Number(sid.slice(1)));
        });
      }
      else if (key === 'bib:' + id) {
        const neu = Bibliothek.get(id);
        if (!neu) return;
        const seitenAnders = JSON.stringify(neu.seiten) !== JSON.stringify(it.seiten) || neu.papier !== it.papier || neu.modus !== it.modus || neu.raster !== it.raster || neu.seitenfarbe !== it.seitenfarbe;
        it = neu;
        kopfFuellen();
        if (seitenAnders && it.art === 'notizbuch') lw.setzeSeiten(notizbuchSeiten());
        if (sl) sl.aktualisiere(); else lw.plane();
      }
    };
    F.kopfNeu = () => { const neu = Bibliothek.get(id); if (neu && !weg) { it = neu; kopfFuellen(); } };

    return F;
  }

  /* ---------- Tabs und Bereiche ---------- */

  let tabs = [];                 // offene Dokumente in Reihenfolge
  let links = null, rechts = null, fokusSeite = 'links';
  let teilung = 0.5;
  let sichtbar = false;          // ist die Dokument-Ansicht gerade zu sehen
  const geladen = new Map();     // id -> DokFenster

  if (hauptfenster) {
    const s = Daten.get(TABS_KEY, null);
    if (s && Array.isArray(s.tabs)) {
      tabs = s.tabs.filter(gueltig);
      links = tabs.includes(s.links) ? s.links : tabs[0] || null;
      rechts = tabs.includes(s.rechts) && s.rechts !== links ? s.rechts : null;
      teilung = Math.max(0.2, Math.min(0.8, Number(s.teilung) || 0.5));
    }
  }
  function merken() {
    if (hauptfenster && !eigenesFenster) Daten.set(TABS_KEY, { tabs, links, rechts, teilung: Math.round(teilung * 1000) / 1000 });
  }
  const fokusId = () => (fokusSeite === 'rechts' && rechts ? rechts : links);

  // Genau eine Leiste ist sichtbar: die des Dokuments im Fokus, solange die Dokument-Ansicht zu sehen ist
  function ordneLeisten() {
    const fokus = sichtbar ? fokusId() : null;
    for (const f of geladen.values()) if (f.id !== fokus) f.leiste(null);
    if (fokus && geladen.get(fokus)) geladen.get(fokus).leiste(leistenSlot);
  }

  function instanz(id) {
    let f = geladen.get(id);
    if (!f) { f = DokFenster(id); geladen.set(id, f); }
    return f;
  }

  // Nicht sichtbare Dokumente freigeben, wenn zu viele geladen sind
  function entladen() {
    const reste = [...geladen.values()].filter(f => f.id !== links && f.id !== rechts).sort((a, b) => a.zuletzt - b.zuletzt);
    while (geladen.size > MAX_GELADEN && reste.length) {
      const f = reste.shift();
      f.zerstoere();
      geladen.delete(f.id);
    }
  }

  function zeigen() {
    if (!links) { zeichneTabs(); return; }
    ansicht.classList.toggle('geteilt', !!rechts);
    for (const f of geladen.values()) if (f.id !== links && f.id !== rechts) f.zeige(false);
    const fl = instanz(links);
    fl.el.style.order = 0;
    fl.el.style.flex = rechts ? `${teilung} 1 0` : '';
    fl.zeige(sichtbar);
    fl.fokus(!!rechts && fokusSeite === 'links');
    if (rechts) {
      const fr = instanz(rechts);
      fr.el.style.order = 2;
      fr.el.style.flex = `${1 - teilung} 1 0`;
      fr.zeige(sichtbar);
      fr.fokus(fokusSeite === 'rechts');
    }
    teiler.hidden = !rechts;
    for (const f of geladen.values()) f.vollbild(voll && (f.id === links || f.id === rechts));
    ordneLeisten();
    zeigeDebug(null);
    zeichneTabs();
    entladen();
    merken();
    if (sichtbar) meldeFokus();
  }

  // Apple Pencil (nur iPad-App, Sicherung.swift LernheftViewController): Doppeltippen und Zusammendrücken
  window.addEventListener('lh-pencil', e => {
    const f = geladen.get(fokusId());
    const lw = f && f.leinwand();
    if (!lw || !sichtbar) return;
    lw.geste(e.detail === 'druecken' ? 'pencilDruecken' : 'pencilDoppel');
  });

  /* ---------- Vollbild: nur die Blätter (auch zwei nebeneinander), mit einer schwebenden Werkzeugleiste ---------- */

  let voll = false;
  function vollbild(an) {
    if (an === voll) return;
    voll = an;
    document.documentElement.classList.toggle('vollbild', an);
    for (const f of geladen.values()) f.vollbild(an && (f.id === links || f.id === rechts));
    try {
      if (an && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      if (!an && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (e) { /* ohne echtes Vollbild geht es trotzdem */ }
  }
  // Esc oder F11 beendet das echte Vollbild, dann auch die Ansicht
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && voll) vollbild(false); });

  // Adresse, Fenstertitel und Lernzeit folgen dem Dokument, in dem man gerade arbeitet
  function meldeFokus() {
    const id = fokusId();
    if (!id) return;
    const ziel = (eigenesFenster ? '#/fenster/' : '#/dok/') + id;
    if (location.hash !== ziel) history.replaceState(null, '', ziel);
    document.title = name(id) + (eigenesFenster ? '' : ' · Lernheft');
    Zeit.setzeBereich('dok:' + id);
  }

  function fokussiere(id) {
    const seite = id === rechts ? 'rechts' : id === links ? 'links' : null;
    if (!seite || seite === fokusSeite) return;
    fokusSeite = seite;
    for (const f of geladen.values()) f.fokus(!!rechts && f.id === fokusId());
    ordneLeisten();
    zeichneTabs();
    meldeFokus();
  }

  // Aus der Adresse #/dok/<id>: als Tab öffnen und im Bereich zeigen, in dem man gerade arbeitet
  function oeffne(id) {
    sichtbar = true;
    if (!gueltig(id)) {
      if (eigenesFenster) { window.close(); return; }
      location.hash = links && gueltig(links) ? '#/dok/' + links : '#/bibliothek';
      return;
    }
    if (!tabs.includes(id)) {
      const i = tabs.indexOf(fokusId());
      tabs.splice(i < 0 ? tabs.length : i + 1, 0, id);
    }
    if (id === links) fokusSeite = 'links';
    else if (id === rechts) fokusSeite = 'rechts';
    else if (fokusSeite === 'rechts' && rechts) rechts = id;
    else { links = id; fokusSeite = 'links'; }
    zeigen();
  }

  // Beim Wechsel in einen anderen Bereich bleiben die Tabs offen
  function verstecke() {
    if (!sichtbar) return;
    vollbild(false);
    sichtbar = false;
    for (const f of geladen.values()) f.zeige(false);
    ordneLeisten();
  }

  function schliesseTab(id) {
    const i = tabs.indexOf(id);
    if (i < 0) return;
    tabs.splice(i, 1);
    const f = geladen.get(id);
    if (f) { f.zerstoere(); geladen.delete(id); }
    if (eigenesFenster && !tabs.length) { window.close(); return; }
    if (id === rechts) { rechts = null; fokusSeite = 'links'; }
    else if (id === links) {
      if (rechts) { links = rechts; rechts = null; }
      else links = tabs.filter(t => t !== rechts)[Math.min(i, tabs.length - 1)] || null;
      fokusSeite = 'links';
    }
    if (!links) {
      teiler.hidden = true;
      ansicht.classList.remove('geteilt');
      zeichneTabs();
      merken();
      if (sichtbar) location.hash = '#/bibliothek';
      return;
    }
    zeigen();
  }

  // Ein Dokument links oder rechts andocken
  function setzeSeite(id, seite) {
    if (!gueltig(id)) return;
    if (!tabs.includes(id)) tabs.push(id);
    if (seite === 'rechts') {
      if (id === rechts) { /* schon da */ }
      else if (id === links) {
        const andere = tabs.find(t => t !== id);
        if (rechts) [links, rechts] = [rechts, links];
        else if (andere) { links = andere; rechts = id; }
        else { meldung('Öffne zuerst ein zweites Dokument, dann lassen sich beide nebeneinander zeigen.'); return; }
      } else if (!links) links = id;
      else rechts = id;
      fokusSeite = rechts === id ? 'rechts' : 'links';
    } else {
      if (id === rechts) [links, rechts] = [rechts, links];
      else links = id;
      fokusSeite = 'links';
    }
    if (sichtbar) zeigen();
    else { merken(); location.hash = '#/dok/' + id; }
  }

  function loesen() {
    // Rechte Seite wird wieder ein normaler Tab
    if (!rechts) return;
    if (fokusSeite === 'rechts') links = rechts;
    rechts = null;
    fokusSeite = 'links';
    zeigen();
  }
  function tauschen() {
    if (!rechts) return;
    [links, rechts] = [rechts, links];
    fokusSeite = fokusSeite === 'rechts' ? 'links' : 'rechts';
    zeigen();
  }

  /* ---------- Eigenes Fenster ---------- */

  function inEigenesFenster(id) {
    if (!gueltig(id)) return;
    const url = location.href.split('#')[0] + '#/fenster/' + id;
    const f = geladen.get(id);
    if (f) { f.zerstoere(); geladen.delete(id); }
    const w = window.open(url, 'lernheft-dok-' + id, 'popup,width=1100,height=820');
    if (!w) { meldung('Das Fenster wurde blockiert'); return; }
    if (tabs.includes(id)) schliesseTab(id);
  }

  // Aus dem eigenen Fenster zurück ins Hauptfenster
  function andocken(seite) {
    const id = links;
    if (!id) { window.close(); return; }
    for (const f of geladen.values()) f.zerstoere();
    geladen.clear();
    Zeit.sichern();
    let ok = false;
    try {
      const haupt = window.opener;
      if (haupt && !haupt.closed && haupt.Dokument) { haupt.Dokument.andockenVonFenster(id, seite); haupt.focus(); ok = true; }
    } catch (e) { ok = false; }
    if (!ok && kanal) kanal.postMessage({ art: 'andocken', id, seite });
    setTimeout(() => window.close(), 60);
  }
  function andockenVonFenster(id, seite) {
    if (!gueltig(id)) return;
    if (seite === 'rechts' && links && links !== id) setzeSeite(id, 'rechts');
    else if (location.hash === '#/dok/' + id) oeffne(id);
    else location.hash = '#/dok/' + id;
    try { window.focus(); } catch (e) { /* egal */ }
  }
  if (kanal) kanal.onmessage = ({ data }) => {
    if (!hauptfenster || !data || data.art !== 'andocken') return;
    andockenVonFenster(data.id, data.seite);
  };

  function alsFenster() {
    if (eigenesFenster) return;
    eigenesFenster = true;
    document.documentElement.classList.add('nur-dok');
    for (const f of geladen.values()) f.zerstoere();
    geladen.clear();
    tabs = []; links = null; rechts = null; fokusSeite = 'links';
  }

  /* ---------- Menüs ---------- */

  // Fenster-Teil des ⋯-Menüs: andocken, eigenes Fenster, schliessen
  // Gruppen für das Menü ⋯: [Titel, Inhalt, zugeklappt?]
  function fensterTeile(id) {
    const akt = (daten, symbol, text, klasse) => `<button type="button" ${daten}${klasse ? ` class="${klasse}"` : ''}>${sym(symbol)}<span>${text}</span></button>`;
    if (eigenesFenster) {
      return [['Fenster', akt('data-a="andocken"', 'fenster', 'Wieder andocken (als Tab)') + akt('data-a="andocken-rechts"', 'daneben', 'Im Hauptfenster daneben andocken') + akt('data-a="schliessen"', 'zu', 'Fenster schliessen', 'gefahr')]];
    }
    const andere = tabs.filter(t => t !== links && t !== rechts);
    const teile = [];
    teile.push(rechts
      ? ['Nebeneinander', akt('data-a="loesen"', 'fenster', 'Nicht mehr nebeneinander') + akt('data-a="tauschen"', 'tauschen', 'Seiten tauschen')]
      : ['Daneben andocken', andere.map(t => akt(`data-daneben="${esc(t)}"`, 'daneben', esc(name(t)))).join('') + akt('data-a="waehlen"', 'daneben', 'Anderes Dokument …')]);
    teile.push(['Fenster', akt('data-a="fenster"', 'fenster', 'In neuem Fenster öffnen') + akt('data-a="schliessen"', 'zu', 'Schliessen', 'gefahr')]);
    // Entwickler: Variante der Trennlinie wählen und die Debug-Anzeige (FPS, Layout-Zeit) ein- und ausschalten
    teile.push(['Trennlinie (Entwickler)', `<div class="mehr-wahl">${Object.entries(SPLIT_VARIANTEN).map(([k, v]) => `<button type="button" role="menuitemradio" aria-checked="${splitWahl() === k}" data-splitv="${k}" title="${esc(v.info)}">${esc(v.name)}</button>`).join('')}<button type="button" role="menuitemcheckbox" aria-checked="${splitDebugAn()}" data-a="splitdebug">FPS und Layout-Zeit anzeigen</button></div>`, true]);
    return teile;
  }
  async function fensterAktion(d, id) {
    if (d.splitv) setzeSplitVariante(d.splitv);
    else if (d.a === 'splitdebug') setzeSplitDebug(!splitDebugAn());
    else if (d.daneben) setzeSeite(d.daneben, 'rechts');
    else if (d.a === 'waehlen') { const w = await waehleDokumente('Daneben öffnen', false); if (w && w.length) setzeSeite(w[0], 'rechts'); }
    else if (d.a === 'loesen') loesen();
    else if (d.a === 'tauschen') tauschen();
    else if (d.a === 'fenster') { vollbild(false); inEigenesFenster(id); }
    else if (d.a === 'andocken') andocken(null);
    else if (d.a === 'andocken-rechts') andocken('rechts');
    else if (d.a === 'schliessen') { if (eigenesFenster) window.close(); else { vollbild(false); schliesseTab(id); } }
  }

  function tabMenue(knopf, id) {
    const html = `
      ${id !== links ? '<button type="button" data-a="links">Links zeigen</button>' : ''}
      ${id !== rechts ? '<button type="button" data-a="rechts">Rechts daneben andocken</button>' : ''}
      ${id === rechts ? '<button type="button" data-a="loesen">Nicht mehr nebeneinander</button>' : ''}
      <button type="button" data-a="fenster">In neuem Fenster öffnen</button>
      <button type="button" data-a="schliessen">Schliessen</button>
      ${tabs.length > 1 ? '<button type="button" data-a="andere">Andere Tabs schliessen</button>' : ''}`;
    menue(knopf, html, d => {
      if (d.a === 'links') setzeSeite(id, 'links');
      else if (d.a === 'rechts') setzeSeite(id, 'rechts');
      else if (d.a === 'loesen') loesen();
      else if (d.a === 'fenster') inEigenesFenster(id);
      else if (d.a === 'schliessen') schliesseTab(id);
      else if (d.a === 'andere') {
        for (const t of tabs.slice()) if (t !== id) schliesseTab(t);
        setzeSeite(id, 'links');
      }
    });
  }

  // Dokumente auswählen: mehrere auf einmal als Tabs öffnen, oder eines zum Andocken
  async function waehleDokumente(titel, mehrere) {
    const docs = Bibliothek.dokumente().sort((a, b) => (b.geoeffnet || 0) - (a.geoeffnet || 0) || a.name.localeCompare(b.name, 'de'));
    if (!docs.length) { meldung('Noch keine Skripte oder Notizbücher in der Bibliothek.'); return null; }
    const typ = mehrere ? 'checkbox' : 'radio';
    return oeffneDialog(`<form class="dialog-form breit">
        <h2>${esc(titel)}</h2>
        <label class="dok-wahl-suche"><span class="sr">Suchen</span><input type="search" placeholder="Suchen" autocomplete="off" autofocus></label>
        <div class="dok-wahl-liste">${docs.map((d, i) => `
          <label class="dok-wahl" data-name="${esc(d.name.toLowerCase())}">
            <input type="${typ}" name="dok" value="${esc(d.id)}" ${!mehrere && i === 0 ? 'checked' : ''}>
            <span class="art-punkt ${d.art}"></span>
            <span class="dok-wahl-text"><strong>${esc(d.name)}</strong><span>${d.art === 'skript' ? 'Skript' : istBrett(d) ? 'Whiteboard' : 'Notizbuch'} · ${esc(Bibliothek.pfadText(d.eltern))}</span></span>
            ${tabs.includes(d.id) ? '<span class="dok-wahl-offen">offen</span>' : ''}
          </label>`).join('')}</div>
        ${knoepfe(mehrere ? 'Öffnen' : 'Daneben öffnen')}
      </form>`, {
      init: dlg => {
        const suche = dlg.querySelector('input[type="search"]');
        suche.addEventListener('input', () => {
          const s = suche.value.trim().toLowerCase();
          dlg.querySelectorAll('.dok-wahl').forEach(z => { z.hidden = !!s && !z.dataset.name.includes(s); });
        });
      },
      wert: dlg => [...dlg.querySelectorAll('input[name="dok"]:checked')].map(x => x.value)
    });
  }

  async function mehrOeffnen() {
    const w = await waehleDokumente('Dokumente öffnen', true);
    if (!w || !w.length) return;
    for (const id of w) if (!tabs.includes(id) && gueltig(id)) tabs.push(id);
    merken();
    const ziel = w[w.length - 1];
    if (location.hash === '#/dok/' + ziel) oeffne(ziel); else location.hash = '#/dok/' + ziel;
  }

  /* ---------- Tableiste ---------- */

  // Alle offenen Dokumente stehen in einem Band, das sich nach links und rechts scrollen lässt (Mausrad, Touchpad,
  // Finger, Pfeile am Rand). Es zeigt etwa 5 Tabs auf einmal (schmal weniger, je Tab mindestens 150 px). Was gerade
  // nicht im Band zu sehen ist, steht im Dropdown "n ▾": antippen öffnet es und scrollt seinen Tab ins Bild.
  const MAX_TABS = 5, TAB_MIN = 150;
  const PFEIL_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg>';
  const PFEIL_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>';
  const band = () => tabLeiste.querySelector('.tab-band');
  function zeichneTabs() {
    const alt = band(), links0 = alt ? alt.scrollLeft : 0;
    const offen = tabs.filter(id => Bibliothek.get(id));
    tabLeiste.innerHTML = `<button class="tab-pfeil" type="button" data-tab-pfeil="-1" title="Tabs nach links" aria-label="Tabs nach links" hidden>${PFEIL_L}</button>
      <div class="tab-band">${offen.map(id => {
        const it = Bibliothek.get(id);
        const an = id === fokusId();
        // Nur der Name; der aktive Tab hat den Hintergrund der Werkzeugleiste und geht ohne Linie in die Fläche darunter über
        return `<div class="dok-tab${id === links || id === rechts ? ' sichtbar' : ''}" role="tab" aria-selected="${an}" data-tab="${esc(id)}" draggable="true" title="${esc(it.name)} (Rechtsklick: andocken, eigenes Fenster)">
          <a class="dok-tab-link" href="#/dok/${esc(id)}" draggable="false"><span class="dok-tab-name">${esc(it.name)}</span></a>
          <button class="dok-tab-zu" type="button" data-zu="${esc(id)}" aria-label="${esc(it.name)} schliessen" title="Schliessen">×</button>
        </div>`;
      }).join('')}</div>
      <button class="tab-pfeil" type="button" data-tab-pfeil="1" title="Tabs nach rechts" aria-label="Tabs nach rechts" hidden>${PFEIL_R}</button>
      <button class="dok-tab-mehr" type="button" data-tab-mehr aria-haspopup="menu" hidden></button>
      <button class="dok-tab-neu" type="button" data-tab-neu title="Weitere Skripte oder Notizbücher öffnen" aria-label="Weitere Dokumente öffnen">＋</button>`;
    const b = band();
    // Breite je Tab: bis 5 Tabs teilen sie sich den Platz, darüber gilt ein Fünftel (mindestens 150 px) und das Band scrollt.
    // Passen nicht alle hinein, stehen Pfeile und Zähler fest daneben (ihr Platz wird vor dem Messen reserviert)
    const platzBei = () => Math.max(1, Math.min(MAX_TABS, Math.floor((b.clientWidth - 24) / TAB_MIN)));
    const voll = offen.length > platzBei();
    tabLeiste.classList.toggle('tabs-voll', voll);
    b.classList.toggle('voll', voll);
    if (voll) { tabLeiste.querySelectorAll('[data-tab-pfeil], [data-tab-mehr]').forEach(k => { k.hidden = false; }); aktualisiereTabRand(); }
    const platz = platzBei();
    b.style.setProperty('--tab-b', Math.max(TAB_MIN, Math.floor((b.clientWidth - 24) / platz)) + 'px');
    b.scrollLeft = links0;
    // Nur wenn ein anderes Dokument ins Bild kommt, den Tab dorthin scrollen; sonst bleibt das Band, wo man es hingescrollt hat
    const fokusJetzt = [links, rechts, fokusId(), offen.length, platz].join('|');   // auch nach einer Grössenänderung
    if (fokusJetzt !== zeichneTabs.fokus) { zeichneTabs.fokus = fokusJetzt; zeigeAktivenTab(false); }
    aktualisiereTabRand();
  }
  // Den gewählten Tab (und beim Nebeneinander beide) ins Bild holen, ohne die Seite zu bewegen
  // Das Band rastet auf ganze Tabs ein (scroll-snap); erster sichtbarer Tab = Index, Position = Anfang dieses Tabs
  const tabListe = () => [...band().querySelectorAll('.dok-tab')];
  const sichtbarAnzahl = () => { const b = band(), l = tabListe(); return l.length ? Math.max(1, Math.round((b.clientWidth - 24) / l[0].offsetWidth)) : 1; };
  const ersterSichtbarer = () => { const b = band(), l = tabListe(); let i = 0; while (i < l.length - 1 && l[i].offsetLeft - 12 < b.scrollLeft - 2) i++; return i; };
  function scrolleZuTab(i, weich) {
    const b = band(), l = tabListe();
    if (!l.length) return;
    i = Math.max(0, Math.min(l.length - 1, i));
    b.scrollTo({ left: l[i].offsetLeft - 12, behavior: weich ? 'smooth' : 'auto' });
  }
  function zeigeAktivenTab(weich) {
    const b = band();
    if (!b) return;
    const l = tabListe(), n = sichtbarAnzahl();
    for (const id of [rechts, fokusId()]) {
      const i = l.findIndex(t => t.dataset.tab === id);
      if (i < 0) continue;
      const erster = ersterSichtbarer();
      if (i < erster) scrolleZuTab(i, weich);
      else if (i > erster + n - 1) scrolleZuTab(i - n + 1, weich);
    }
  }
  // Tabs, die gerade (ganz oder teilweise) ausserhalb des Bands liegen
  function verdeckteTabs() {
    const b = band();
    if (!b) return [];
    const r = b.getBoundingClientRect();
    return [...b.querySelectorAll('.dok-tab')].filter(t => { const q = t.getBoundingClientRect(); return q.left < r.left - 2 || q.right > r.right + 2; }).map(t => t.dataset.tab);
  }
  // Pfeile nur, wenn es in diese Richtung noch etwas gibt; der Zähler zeigt, wie viele Tabs gerade nicht zu sehen sind
  function aktualisiereTabRand() {
    const b = band();
    if (!b) return;
    const max = b.scrollWidth - b.clientWidth, voll = b.classList.contains('voll');
    // Pfeile behalten ihren Platz (sonst änderte sich die Breite des Bands beim Scrollen), sie werden nur unsichtbar
    const pfeil = (r, aus) => { const k = tabLeiste.querySelector(`[data-tab-pfeil="${r}"]`); k.hidden = !voll; k.style.visibility = aus ? 'hidden' : ''; };
    pfeil(-1, b.scrollLeft <= 2);
    pfeil(1, b.scrollLeft >= max - 2);
    const n = verdeckteTabs().length, k = tabLeiste.querySelector('[data-tab-mehr]');
    k.hidden = !voll;
    k.style.visibility = n ? '' : 'hidden';
    k.innerHTML = `${n}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>`;
    k.title = k.ariaLabel = `${n} ${n === 1 ? 'Tab ist' : 'Tabs sind'} gerade nicht zu sehen`;
  }
  let tabRandBild = 0;
  tabLeiste.addEventListener('scroll', () => { if (!tabRandBild) tabRandBild = requestAnimationFrame(() => { tabRandBild = 0; aktualisiereTabRand(); }); }, true);
  // Mausrad und Touchpad: senkrechtes Drehen scrollt das Band waagrecht
  tabLeiste.addEventListener('wheel', e => {
    const b = band();
    if (!b || b.scrollWidth <= b.clientWidth) return;
    const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 40 : 1);
    if (!d) return;
    e.preventDefault();
    radSumme += d;
    clearTimeout(radTimer);
    radTimer = setTimeout(() => { radSumme = 0; }, 250);
    if (Math.abs(radSumme) < 60) return;
    const schritt = Math.sign(radSumme) * Math.max(1, Math.min(3, Math.floor(Math.abs(radSumme) / 60)));
    radSumme = 0;
    scrolleZuTab(ersterSichtbarer() + schritt, true);
  }, { passive: false });
  let radSumme = 0, radTimer = 0;
  // Dropdown der Tabs, die gerade nicht zu sehen sind: antippen zeigt das Dokument und scrollt seinen Tab ins Bild, × schliesst es
  function tabsMenue(knopf) {
    const rest = verdeckteTabs().filter(id => Bibliothek.get(id));
    if (!rest.length) return;
    const art = it => (istBrett(it) ? 'Whiteboard' : it.art === 'skript' ? 'Skript' : 'Notizbuch');
    const el = menue(knopf, `<div class="kontext-titel">Nicht zu sehen</div>${rest.map(id => {
      const it = Bibliothek.get(id);
      return `<div class="tab-wahl-zeile"><button type="button" role="menuitem" data-tab-wahl="${esc(id)}"><span class="tab-wahl-name">${esc(it.name)}</span><span class="tab-wahl-art">${art(it)}</span></button><button type="button" class="tab-wahl-zu" data-tab-weg="${esc(id)}" aria-label="${esc(it.name)} schliessen" title="Schliessen">×</button></div>`;
    }).join('')}`, d => {
      if (d.tabWahl) { if (location.hash === '#/dok/' + d.tabWahl) oeffne(d.tabWahl); else location.hash = '#/dok/' + d.tabWahl; }
      else if (d.tabWeg) schliesseTab(d.tabWeg);
    });
    el.classList.add('tab-wahl');
  }
  window.addEventListener('resize', () => { clearTimeout(zeichneTabs.t); zeichneTabs.t = setTimeout(zeichneTabs, 120); });

  tabLeiste.addEventListener('click', e => {
    const zu = e.target.closest('[data-zu]');
    if (zu) { e.preventDefault(); schliesseTab(zu.dataset.zu); return; }
    if (e.target.closest('[data-tab-neu]')) mehrOeffnen();
    const mehr = e.target.closest('[data-tab-mehr]');
    if (mehr) { e.stopPropagation(); tabsMenue(mehr); }
    const pfeil = e.target.closest('[data-tab-pfeil]');
    if (pfeil) scrolleZuTab(ersterSichtbarer() + Number(pfeil.dataset.tabPfeil) * Math.max(1, sichtbarAnzahl() - 1), true);
  });
  // Mittlere Maustaste schliesst einen Tab
  tabLeiste.addEventListener('auxclick', e => {
    const t = e.target.closest('[data-tab]');
    if (t && e.button === 1) { e.preventDefault(); schliesseTab(t.dataset.tab); }
  });
  tabLeiste.addEventListener('contextmenu', e => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    e.preventDefault();
    tabMenue(t, t.dataset.tab);
  });

  // Tab ziehen: auf die linke oder rechte Hälfte andocken, aus dem Fenster hinaus ergibt ein eigenes Fenster
  const ablage = document.createElement('div');
  ablage.className = 'dok-ablage';
  ablage.hidden = true;
  bereiche.appendChild(ablage);
  let gezogen = null;
  tabLeiste.addEventListener('dragstart', e => {
    const t = e.target.closest('[data-tab]');
    if (!t) return;
    gezogen = t.dataset.tab;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', name(gezogen));
    ansicht.classList.add('zieht-tab');
  });
  tabLeiste.addEventListener('dragend', e => {
    const id = gezogen;
    gezogen = null;
    ablage.hidden = true;
    ansicht.classList.remove('zieht-tab');
    if (!id || e.dataTransfer.dropEffect !== 'none') return;
    const draussen = e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight;
    if (draussen) inEigenesFenster(id);
  });
  const seiteBei = x => { const r = bereiche.getBoundingClientRect(); return x < r.left + r.width / 2 ? 'links' : 'rechts'; };
  bereiche.addEventListener('dragover', e => {
    if (!gezogen) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    ablage.hidden = false;
    ablage.dataset.seite = seiteBei(e.clientX);
  });
  bereiche.addEventListener('dragleave', e => { if (!bereiche.contains(e.relatedTarget)) ablage.hidden = true; });
  bereiche.addEventListener('drop', e => {
    if (!gezogen) return;
    e.preventDefault();
    const id = gezogen;
    ablage.hidden = true;
    setzeSeite(id, seiteBei(e.clientX));
  });

  // Mit dem Finger oder Stift (iPad): einen Tab nach unten aus der Leiste ziehen, auf der linken oder rechten Hälfte
  // loslassen. Waagrecht wischen scrollt die Tabs wie bisher (die Tabs haben touch-action: pan-x, senkrechte Züge
  // bleiben deshalb hier). Ein Geist mit dem Namen folgt dem Finger, die Hälfte, in die er fällt, leuchtet auf.
  let fingerZug = null, klickNachZug = false;
  const imBereich = (x, y) => { const r = bereiche.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  tabLeiste.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || fingerZug) return;
    const t = e.target.closest('[data-tab]');
    if (!t || e.target.closest('[data-zu]')) return;
    fingerZug = { id: t.dataset.tab, pid: e.pointerId, x: e.clientX, y: e.clientY, aktiv: false, tab: t, geist: null };
  });
  tabLeiste.addEventListener('pointermove', e => {
    const z = fingerZug;
    if (!z || e.pointerId !== z.pid) return;
    const dx = e.clientX - z.x, dy = e.clientY - z.y;
    if (!z.aktiv) {
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy)) { fingerZug = null; return; }   // waagrecht: Tabs scrollen
      if (dy < 16 || dy < Math.abs(dx) * 1.2) return;
      z.aktiv = true;
      try { z.tab.setPointerCapture(e.pointerId); } catch (err) { /* geht auch ohne */ }
      z.geist = document.createElement('div');
      z.geist.className = 'dok-zieh-geist';
      z.geist.textContent = name(z.id);
      document.body.appendChild(z.geist);
      ansicht.classList.add('zieht-tab');
    }
    e.preventDefault();
    z.geist.style.transform = `translate(${Math.round(e.clientX)}px, ${Math.round(e.clientY)}px)`;
    const drin = imBereich(e.clientX, e.clientY);
    ablage.hidden = !drin;
    if (drin) ablage.dataset.seite = seiteBei(e.clientX);
  });
  const fingerZugEnde = e => {
    const z = fingerZug;
    if (!z || e.pointerId !== z.pid) return;
    fingerZug = null;
    if (!z.aktiv) return;
    z.geist.remove();
    ablage.hidden = true;
    ansicht.classList.remove('zieht-tab');
    klickNachZug = true;
    setTimeout(() => { klickNachZug = false; }, 350);
    if (e.type === 'pointerup' && imBereich(e.clientX, e.clientY)) setzeSeite(z.id, seiteBei(e.clientX));
  };
  tabLeiste.addEventListener('pointerup', fingerZugEnde);
  tabLeiste.addEventListener('pointercancel', fingerZugEnde);
  // Nach dem Ziehen soll der Tab nicht auch noch als angetippt gelten
  tabLeiste.addEventListener('click', e => { if (klickNachZug) { e.preventDefault(); e.stopPropagation(); } }, true);

  /* ---------- Trennlinie zwischen zwei Dokumenten ----------
     Gemeinsam für alle Varianten: ein Update je Bild (requestAnimationFrame, nicht je Zeiger-Ereignis), Zeiger am Griff festgehalten
     (setPointerCapture, touch-action: none, grosse Trefferfläche), Maße einmal zu Beginn gelesen (kein Layout-Thrashing). Die Varianten
     unterscheiden sich darin, was während des Ziehens mit den beiden Schreibflächen geschieht. */

  // Zentraler Standardwert. Die Wahl pro Gerät steht in lokal:split-variante (Menü ⋯ > "Trennlinie (Entwickler)" oder Einstellungen).
  const SPLIT_VARIANT = 'C';
  const SPLIT_RASTER = [0.3, 0.5, 0.7];
  const SPLIT_KEY = 'lokal:split-variante', SPLIT_DEBUG_KEY = 'lokal:split-debug', SPLIT_MESSUNG_KEY = 'lokal:split-messung';

  const klemmeTeilung = t => Math.max(0.2, Math.min(0.8, t));
  const hatLeinwand = f => f && f.leinwand && f.leinwand();
  function wendeTeilung(t) {
    teilung = t;
    if (links && geladen.get(links)) geladen.get(links).el.style.flex = `${t} 1 0`;
    if (rechts && geladen.get(rechts)) geladen.get(rechts).el.style.flex = `${1 - t} 1 0`;
  }
  const geist = document.createElement('div');   // Vorschau-Linie (Varianten A und D), wird per transform bewegt
  geist.className = 'dok-geist';
  geist.hidden = true;
  bereiche.appendChild(geist);
  function zeigeGeist(s, t) {
    geist.hidden = false;
    geist.classList.toggle('quer', s.vertikal);
    const px = s.frei * t + s.teilerGroesse / 2 - 2;
    geist.style.transform = s.vertikal ? `translateY(${px}px)` : `translateX(${px}px)`;
  }
  const naechstesRaster = t => SPLIT_RASTER.reduce((b, r) => (Math.abs(r - t) < Math.abs(b - t) ? r : b), SPLIT_RASTER[0]);
  const flaechenVon = s => [s.links, s.rechts].map(f => f && f.el.querySelector('.dok-flaeche')).filter(Boolean);

  const SPLIT_VARIANTEN = {
    // A: Visuelles Verschieben mit Transform. Beim Ziehen bewegt sich nur die Vorschau-Linie (GPU); die Schreibflächen sind
    // eingefroren und werden erst beim Loslassen einmal in der Grösse angepasst und neu gemalt.
    A: {
      name: 'A · Transform (Vorschau-Linie)',
      info: 'Beim Ziehen bewegt sich nur eine Linie, die Blätter ändern sich erst beim Loslassen.',
      start: s => { s.lw.forEach(l => l.friere(true)); zeigeGeist(s, s.t); },
      bewege: (s, t) => zeigeGeist(s, t),
      ende: (s, t) => { geist.hidden = true; wendeTeilung(t); s.lw.forEach(l => l.friere(false, true)); }
    },
    // B: nur Bildtakt und Zeiger-Festhalten; die Blätter ändern sich bei jedem Bild live (will-change nur während des Ziehens)
    B: {
      name: 'B · rAF + Pointer Capture',
      info: 'Ein Update je Bild, die Blätter werden live angepasst und neu gemalt.',
      start: s => flaechenVon(s).forEach(f => { f.style.willChange = 'contents'; }),
      bewege: (s, t) => wendeTeilung(t),
      ende: (s, t) => { wendeTeilung(t); flaechenVon(s).forEach(f => { f.style.willChange = ''; }); }
    },
    // C: Bitmap-Cache. Die Schreibflächen sind eingefroren, ihr fertig gemaltes Bild wandert nur mit, unverzerrt (Grafikkarte,
    // vorschauBreite); das echte Neumalen passiert einmal nach dem Loslassen.
    C: {
      name: 'C · Bitmap (ohne Strecken)',
      info: 'Die Blätter wandern beim Ziehen als fertiges Bild mit, ohne verzerrt zu werden; das echte Neumalen kommt nach dem Loslassen.',
      start: s => s.lw.forEach(l => l.friere(true)),
      bewege: (s, t) => {
        wendeTeilung(t);
        if (s.lwLinks) s.lwLinks.vorschauBreite(s.frei * t);
        if (s.lwRechts) s.lwRechts.vorschauBreite(s.frei * (1 - t));
      },
      ende: (s, t) => { wendeTeilung(t); s.lw.forEach(l => l.friere(false, true)); }
    },
    // D: Einrasten an 30/70, 50/50 und 70/30: nur wenige Layout-Wechsel, die Vorschau-Linie zeigt das Ziel
    D: {
      name: 'D · Einrasten (30/50/70)',
      info: 'Die Trennlinie springt an 30/70, 50/50 und 70/30; nur dort wird das Layout gewechselt.',
      start: s => { s.angewandt = s.t; zeigeGeist(s, naechstesRaster(s.t)); },
      bewege: (s, t) => {
        const r = naechstesRaster(t);
        zeigeGeist(s, r);
        if (r !== s.angewandt) { s.angewandt = r; wendeTeilung(r); }
      },
      ende: (s, t) => { geist.hidden = true; wendeTeilung(naechstesRaster(t)); }
    }
  };
  const splitWahl = () => { const v = Daten.get(SPLIT_KEY, SPLIT_VARIANT); return SPLIT_VARIANTEN[v] ? v : SPLIT_VARIANT; };
  const splitDebugAn = () => !!Daten.get(SPLIT_DEBUG_KEY, false);

  // Debug-Anzeige: während des Ziehens live, danach die letzte Messung jeder Variante zum Vergleichen
  const debug = document.createElement('div');
  debug.className = 'dok-debug';
  debug.hidden = true;
  bereiche.appendChild(debug);
  const zahl1 = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
  function zeigeDebug(live) {
    debug.hidden = !splitDebugAn() || !rechts;
    if (debug.hidden) return;
    const m = Daten.get(SPLIT_MESSUNG_KEY, {});
    const zeilen = [`Trennlinie: ${SPLIT_VARIANTEN[splitWahl()].name}`];
    if (live) zeilen.push(`jetzt: ${zahl1(live.fps)} Bilder/s · Bild ${zahl1(live.bildMs)} ms (max ${zahl1(live.maxMs)}) · Layout ${zahl1(live.layoutMs)} ms · ${live.neu}× neu gemalt`);
    for (const [k, v] of Object.entries(SPLIT_VARIANTEN)) {
      const x = m[k];
      zeilen.push(`${k}${k === splitWahl() ? ' ◀' : '  '} ${x ? `${zahl1(x.fps)} B/s · max ${zahl1(x.maxMs)} ms · Layout ${zahl1(x.layoutMs)} ms · ${x.neu}× neu (${zahl1(x.neuMs)} ms) · ${x.langsam} langsame` : v.name.split(' · ')[1] + ': noch nicht gemessen'}`);
    }
    debug.textContent = zeilen.join('\n');
  }

  let ziehen = null;
  function ziehRahmen(zeit) {
    const z = ziehen;
    if (!z) return;
    if (z.letzte) z.intervalle.push(zeit - z.letzte);
    z.letzte = zeit;
    if (z.pos !== z.angewandtPos) {
      z.angewandtPos = z.pos;
      const t = klemmeTeilung((z.pos - z.anfang - z.teilerGroesse / 2) / z.frei);
      const t0 = performance.now();
      z.v.bewege(z, t);
      z.layout.push(performance.now() - t0);
      z.t = t;
    }
    if (zeit - z.letzteAnzeige > 250 && splitDebugAn()) { z.letzteAnzeige = zeit; zeigeDebug(ziehMessung(z)); }
    z.rahmen = requestAnimationFrame(ziehRahmen);
  }
  function ziehMessung(z) {
    const iv = z.intervalle.slice(1);   // das erste Bild enthält das Aufsetzen
    const mittel = iv.length ? iv.reduce((a, b) => a + b, 0) / iv.length : 16.7;
    const neu = z.lw.reduce((a, l) => a + l.messung().anzahl, 0), neuMs = z.lw.reduce((a, l) => a + l.messung().ms, 0);
    return {
      fps: 1000 / mittel, bildMs: mittel, maxMs: iv.length ? Math.max(...iv) : 0, langsam: iv.filter(d => d > 33.4).length,
      layoutMs: z.layout.length ? z.layout.reduce((a, b) => a + b, 0) / z.layout.length : 0, neu, neuMs
    };
  }
  teiler.addEventListener('pointerdown', e => {
    if (ziehen || e.button > 0 || !rechts) return;
    e.preventDefault();
    try { teiler.setPointerCapture(e.pointerId); } catch (x) { /* geht auch ohne */ }
    // Alle Masse einmal lesen, danach nur noch rechnen
    const r = bereiche.getBoundingClientRect();
    const vertikal = getComputedStyle(bereiche).flexDirection === 'column';
    const teilerGroesse = vertikal ? teiler.offsetHeight : teiler.offsetWidth;
    const fl = geladen.get(links), fr = geladen.get(rechts);
    const s = {
      id: e.pointerId, v: SPLIT_VARIANTEN[splitWahl()], vertikal, teilerGroesse, anfang: vertikal ? r.top : r.left,
      frei: (vertikal ? r.height : r.width) - teilerGroesse, t: teilung, pos: vertikal ? e.clientY : e.clientX, angewandtPos: null,
      links: fl, rechts: fr, lwLinks: hatLeinwand(fl) || null, lwRechts: hatLeinwand(fr) || null,
      intervalle: [], layout: [], letzte: 0, letzteAnzeige: 0, rahmen: 0
    };
    s.lw = [s.lwLinks, s.lwRechts].filter(Boolean);
    s.lw.forEach(l => l.messungNull());
    ziehen = s;
    ansicht.classList.add('teilt');
    s.v.start(s);
    s.rahmen = requestAnimationFrame(ziehRahmen);
  });
  teiler.addEventListener('pointermove', e => {
    if (!ziehen || e.pointerId !== ziehen.id) return;
    ziehen.pos = ziehen.vertikal ? e.clientY : e.clientX;   // gemerkt, angewandt wird im nächsten Bild
  });
  function ziehEnde(e) {
    const z = ziehen;
    if (!z || (e && e.pointerId !== z.id)) return;
    ziehen = null;
    cancelAnimationFrame(z.rahmen);
    const t = klemmeTeilung((z.pos - z.anfang - z.teilerGroesse / 2) / z.frei);
    z.v.ende(z, t);
    ansicht.classList.remove('teilt');
    try { teiler.releasePointerCapture(z.id); } catch (x) { /* schon frei */ }
    // Messung der Variante merken (nur wenn wirklich gezogen wurde)
    if (z.intervalle.length > 5) {
      const m = ziehMessung(z), alle = Object.assign({}, Daten.get(SPLIT_MESSUNG_KEY, {}));
      alle[splitWahl()] = { fps: m.fps, maxMs: m.maxMs, layoutMs: m.layoutMs, neu: m.neu, neuMs: m.neuMs, langsam: m.langsam };
      Daten.set(SPLIT_MESSUNG_KEY, alle);
      letzteMessung = m;
    }
    zeigeDebug(null);
    merken();
  }
  let letzteMessung = null;
  teiler.addEventListener('pointerup', ziehEnde);
  teiler.addEventListener('pointercancel', ziehEnde);
  teiler.addEventListener('keydown', e => {
    const d = { ArrowLeft: -0.05, ArrowRight: 0.05, ArrowUp: -0.05, ArrowDown: 0.05 }[e.key];
    if (!d) return;
    e.preventDefault();
    teilung = klemmeTeilung(teilung + d);
    zeigen();
  });
  function setzeSplitVariante(v) { if (SPLIT_VARIANTEN[v]) { Daten.set(SPLIT_KEY, v); zeigeDebug(null); } }
  function setzeSplitDebug(an) { Daten.set(SPLIT_DEBUG_KEY, !!an); zeigeDebug(null); }

  /* ---------- Änderungen ---------- */

  let tabTimer = 0;
  Daten.on(ev => {
    for (const f of geladen.values()) f.extern(ev);
    if (!ev.key.startsWith('bib:')) return;
    const id = ev.key.slice(4);
    if (tabs.includes(id) && !Bibliothek.get(id)) {
      const warSichtbar = sichtbar && (id === links || id === rechts);
      schliesseTab(id);
      if (warSichtbar) meldung('Dieses Dokument wurde gelöscht.');
      return;
    }
    if (tabs.includes(id)) {
      clearTimeout(tabTimer);
      tabTimer = setTimeout(() => { zeichneTabs(); geladen.forEach(f => f.kopfNeu()); if (sichtbar) meldeFokus(); }, 150);
    }
  });
  Zeit.on(() => geladen.forEach(f => f.zeigeZeit()));
  Daten.on(({ key }) => { if (key.startsWith('zeit:')) geladen.forEach(f => f.zeigeZeit()); });
  window.addEventListener('pagehide', () => { for (const f of geladen.values()) f.zerstoere(); });
  // Strg+V (auf dem iPad mit Tastatur Cmd+V): ein Bild aus der Zwischenablage kommt in das Dokument im Fokus
  document.addEventListener('paste', e => {
    if (!sichtbar || (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) || (window.UI && UI.dialogOffen && UI.dialogOffen())) return;
    const f = geladen.get(fokusId());
    const lw = f && f.leinwand();
    if (lw && lw.fuegeEinAus(e.clipboardData)) e.preventDefault();
  });

  zeichneTabs();

  window.Dokument = {
    oeffne, verstecke, schliesse: verstecke, schliesseTab, setzeSeite, inEigenesFenster, andockenVonFenster, alsFenster,
    daneben: id => setzeSeite(id, 'rechts'),
    aktiv: () => sichtbar && !!geladen.get(fokusId()),
    leinwand: () => { const f = geladen.get(fokusId()); return f ? f.leinwand() : null; },
    stiftPanel: () => { const f = sichtbar && geladen.get(fokusId()); return f ? f.stiftPanel() : false; },
    // In diesem Fenster offen (seine Handschrift bleibt dann im Speicher)
    istGeladen: id => geladen.has(id),
    taste: e => {
      const f = geladen.get(fokusId());
      if (f && f.taste(e)) return true;
      if (e.key === 'Escape' && voll) { vollbild(false); return true; }
      return false;
    },
    vollbild: an => vollbild(an === undefined ? !voll : !!an),
    splitVariante: v => { if (v) setzeSplitVariante(v); return splitWahl(); },
    splitDebug: an => { if (an !== undefined) setzeSplitDebug(an); return splitDebugAn(); },
    splitMessung: () => Daten.get(SPLIT_MESSUNG_KEY, {}),
    splitVarianten: () => Object.entries(SPLIT_VARIANTEN).map(([k, v]) => [k, v.name]),
    id: () => fokusId(),
    tabs: () => ({ tabs: tabs.slice(), links, rechts, fokus: fokusSeite })
  };
});
