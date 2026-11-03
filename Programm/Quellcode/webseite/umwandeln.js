'use strict';
// Whiteboard <-> Seiten-Dokument. Beides sind Kopien: das Original bleibt unverändert, nichts geht verloren.
//   brettZuSeiten(id)   Whiteboard in ein Notizbuch mit A4- oder A3-Seiten zerlegen (Striche an den Seitenrändern werden geteilt)
//   seitenZuBrett(id)   Seiten eines Notizbuchs oder Skripts nebeneinander auf ein neues Whiteboard legen (bei einem
//                       Skript nur die Handschrift, die PDF-Seiten selbst nicht)
(function () {
  const { esc, neueId, oeffneDialog, warteDialog, warteText, schliesseDialog, knoepfe, meldung } = UI;
  const r1 = n => Math.round(n * 10) / 10;
  const kurzId = () => Math.random().toString(36).slice(2, 10);
  const klon = o => JSON.parse(JSON.stringify(o));
  const istNotiz = e => e && e.typ === 'notiz';
  const istKasten = e => istNotiz(e) || (e && (e.typ === 'bild' || e.typ === 'text'));
  const seitenInhalt = (id, sid) => ((Daten.get('ink:' + id + ':' + sid) || {}).e || []);
  const hatBrett = it => it.art === 'notizbuch' && it.papier === 'whiteboard';

  /* ---------- Striche an einem Rechteck abschneiden ---------- */

  // Liang-Barsky: der Teil der Strecke a-b im Rechteck als [t0, t1] oder null
  function stueck(a, b, r) {
    let t0 = 0, t1 = 1;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const ps = [-dx, dx, -dy, dy], qs = [a[0] - r.x1, r.x2 - a[0], a[1] - r.y1, r.y2 - a[1]];
    for (let i = 0; i < 4; i++) {
      if (ps[i] === 0) { if (qs[i] < 0) return null; continue; }
      const t = qs[i] / ps[i];
      if (ps[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return t0 <= t1 ? [t0, t1] : null;
  }
  function zwischen(a, b, t) {
    const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + ((b[2] == null ? a[2] : b[2]) - a[2]) * t];
    if (a.length > 3 || b.length > 3) { const n = (a[3] || 0) + ((b[3] || 0) - (a[3] || 0)) * t; if (n) q.push(n); }
    return q;
  }
  // Teile eines Strichs im Rechteck r, verschoben so, dass r.x1/r.y1 zum Ursprung wird. Ein Strich über den Rand
  // wird in zwei (oder mehr) Striche geteilt, jeder mit eigener Kennung.
  function schneide(st, r) {
    const p = st.p, teile = [];
    const neu = pts => ({ ...st, id: kurzId(), m: Date.now(), p: pts.map(q => { const c = q.slice(); c[0] = r1(q[0] - r.x1); c[1] = r1(q[1] - r.y1); return c; }) });
    if (p.length === 1) return p[0][0] >= r.x1 && p[0][0] <= r.x2 && p[0][1] >= r.y1 && p[0][1] <= r.y2 ? [neu([p[0]])] : [];
    let lauf = null;
    const fertig = () => { if (lauf && lauf.length > 1) teile.push(neu(lauf)); lauf = null; };
    for (let i = 1; i < p.length; i++) {
      const c = stueck(p[i - 1], p[i], r);
      if (!c) { fertig(); continue; }
      if (!lauf || c[0] > 0) { fertig(); lauf = [zwischen(p[i - 1], p[i], c[0])]; }
      lauf.push(zwischen(p[i - 1], p[i], c[1]));
      if (c[1] < 1) fertig();
    }
    fertig();
    return teile;
  }
  const strichUmriss = e => Leinwand.grenzen(e);
  const ueberlappt = (g, r) => !(g.x2 < r.x1 || g.x1 > r.x2 || g.y2 < r.y1 || g.y1 > r.y2);

  /* ---------- Whiteboard -> Seiten ---------- */

  async function brettZuSeiten(id) {
    const it = Bibliothek.get(id);
    if (!it) return;
    if (!hatBrett(it)) { meldung('Das ist kein Whiteboard.'); return; }
    const r = await oeffneDialog(`<form class="dialog-form breit">
        <h2>Whiteboard in Seiten umwandeln</h2>
        <label class="feld"><span>Name des neuen Dokuments</span><input name="name" value="${esc(it.name)} (Seiten)" required maxlength="120" autofocus autocomplete="off"></label>
        <fieldset class="wahl-reihe"><legend>Format</legend>
          <label class="wahl-karte"><input type="radio" name="format" value="A4" checked><span class="format-bild a4"></span><span>A4</span></label>
          <label class="wahl-karte"><input type="radio" name="format" value="A3"><span class="format-bild a3"></span><span>A3</span></label>
        </fieldset>
        <fieldset class="wahl-reihe"><legend>Papier</legend>
          ${Object.entries(Bibliothek.PAPIERE).map(([p, n]) => `<label class="wahl-karte"><input type="radio" name="papier" value="${p}" ${p === 'blanko' ? 'checked' : ''}><span class="papier-bild ${p}"></span><span>${n}</span></label>`).join('')}
        </fieldset>
        <p class="dialog-klein">Das Whiteboard wird von links oben nach rechts unten in Seiten zerlegt, leere Stellen entfallen. Striche über einem Seitenrand werden geteilt. Das Whiteboard selbst bleibt, wie es ist.</p>
        ${knoepfe('Umwandeln')}
      </form>`, {
      wert: d => ({
        name: d.querySelector('[name="name"]').value.trim() || it.name,
        format: d.querySelector('[name="format"]:checked').value,
        papier: d.querySelector('[name="papier"]:checked').value
      })
    });
    if (!r) return;
    const F = Leinwand.FORMATE[r.format] || Leinwand.FORMATE.A4;
    const liste = seitenInhalt(id, (it.seiten || [])[0]);
    let g = null;
    for (const e of liste) {
      const u = strichUmriss(e);
      g = g ? { x1: Math.min(g.x1, u.x1), y1: Math.min(g.y1, u.y1), x2: Math.max(g.x2, u.x2), y2: Math.max(g.y2, u.y2) } : { ...u };
    }
    const seiten = [];   // { sid, e: [...] }
    if (g) {
      const rand = 24, ox = g.x1 - rand, oy = g.y1 - rand;
      const spalten = Math.max(1, Math.ceil((g.x2 + rand - ox) / F.b)), zeilen = Math.max(1, Math.ceil((g.y2 + rand - oy) / F.h));
      if (spalten * zeilen > 300) { meldung('Das Whiteboard ist dafür zu gross (mehr als 300 Seiten). Wähle A3 oder verkleinere den Inhalt.'); return; }
      const umrisse = liste.map(strichUmriss);
      for (let z = 0; z < zeilen; z++) {
        for (let s = 0; s < spalten; s++) {
          const feld = { x1: ox + s * F.b, y1: oy + z * F.h, x2: ox + (s + 1) * F.b, y2: oy + (z + 1) * F.h };
          const e = [];
          liste.forEach((el, i) => {
            if (!ueberlappt(umrisse[i], feld)) return;
            if (istKasten(el)) {
              // Haftnotiz, Bild oder Text: gehört zu der Seite, auf der seine Mitte liegt
              const mx = (umrisse[i].x1 + umrisse[i].x2) / 2, my = (umrisse[i].y1 + umrisse[i].y2) / 2;
              if (mx < feld.x1 || mx >= feld.x2 || my < feld.y1 || my >= feld.y2) return;
              const k = klon(el);
              k.id = kurzId(); k.m = Date.now(); k.x = r1(el.x - feld.x1); k.y = r1(el.y - feld.y1);
              e.push(k);
            } else e.push(...schneide(el, feld));
          });
          if (e.length) seiten.push({ sid: neueId(), e });
        }
      }
    }
    if (!seiten.length) seiten.push({ sid: neueId(), e: [] });
    const neu = neueId();
    Bibliothek.speichere(neu, {
      art: 'notizbuch', name: r.name, eltern: it.eltern || null, format: r.format, papier: r.papier, farbe: it.farbe || 'blau',
      seiten: seiten.map(s => s.sid), erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false
    });
    for (const s of seiten) if (s.e.length) Daten.set('ink:' + neu + ':' + s.sid, { e: s.e });
    meldung(`„${r.name}“ angelegt: ${seiten.length} ${seiten.length === 1 ? 'Seite' : 'Seiten'}`, { text: 'Öffnen', fn: () => { location.hash = '#/dok/' + neu; } });
  }

  /* ---------- Seiten -> Whiteboard ---------- */

  async function pdfGroessen(it) {
    try {
      const blob = await Daten.datei.get('pdf:' + it.datei);
      if (!blob) return null;
      const pdf = await PdfDienst.oeffnePdf(new Uint8Array(await blob.arrayBuffer()));
      const r = [];
      for (let nr = 1; nr <= pdf.numPages; nr++) {
        warteText(`Seite ${nr} von ${pdf.numPages} …`);
        const v = Leinwand.pdfAnsicht(await pdf.getPage(nr), PdfDienst.EINHEIT, it, nr);
        r.push({ b: v.width, h: v.height });
      }
      pdf.destroy();
      return r;
    } catch (e) { return null; }
  }

  async function seitenZuBrett(id) {
    const it = Bibliothek.get(id);
    if (!it) return;
    if (hatBrett(it)) { meldung('Das ist schon ein Whiteboard.'); return; }
    const skript = it.art === 'skript';
    const r = await oeffneDialog(`<form class="dialog-form breit">
        <h2>Als Whiteboard kopieren</h2>
        <label class="feld"><span>Name des Whiteboards</span><input name="name" value="${esc(it.name)} (Whiteboard)" required maxlength="120" autofocus autocomplete="off"></label>
        <fieldset class="wahl-reihe"><legend>Raster</legend>
          ${Object.entries(Bibliothek.RASTER).map(([p, n], i) => `<label class="wahl-karte"><input type="radio" name="raster" value="${p}" ${i === 0 ? 'checked' : ''}><span class="papier-bild ${p}"></span><span>${n}</span></label>`).join('')}
        </fieldset>
        <label class="haken-label"><input type="checkbox" name="rahmen" checked> Seitenrahmen zeichnen</label>
        <p class="dialog-klein">Die Seiten liegen nebeneinander auf dem Whiteboard (fünf pro Reihe), mit allem, was darauf steht.${skript ? ' Von einem Skript wird nur die Handschrift übernommen, nicht die PDF-Seite darunter.' : ''} Das Original bleibt, wie es ist.</p>
        ${knoepfe('Kopieren')}
      </form>`, {
      wert: d => ({
        name: d.querySelector('[name="name"]').value.trim() || it.name,
        raster: d.querySelector('[name="raster"]:checked').value,
        rahmen: d.querySelector('[name="rahmen"]').checked
      })
    });
    if (!r) return;
    let seiten;
    if (skript) {
      warteDialog('Seiten werden gelesen …');
      const groessen = await pdfGroessen(it);
      schliesseDialog();
      const n = Number(it.seiten) || (groessen ? groessen.length : 0);
      seiten = Array.from({ length: n }, (_, i) => ({ sid: 'p' + (i + 1), ...(groessen && groessen[i] ? groessen[i] : Leinwand.FORMATE.A4) }));
    } else {
      seiten = (it.seiten || []).map(sid => { const f = Leinwand.seitenFormat(it, sid); return { sid, b: f.b, h: f.h }; });
    }
    const SPALTEN = 5, LUECKE = 96;
    const e = [];
    let x = 0, y = 0, zeilenH = 0;
    seiten.forEach((s, i) => {
      if (i && i % SPALTEN === 0) { x = 0; y += zeilenH + LUECKE; zeilenH = 0; }
      if (r.rahmen) {
        const p = LHFormen.rechteckPunkte(x, y, s.b, s.h).map(([px, py]) => [px, py, 0.5]);
        e.push({ id: kurzId(), w: 'stift', f: '#8a93a6', d: 1.2, m: Date.now(), p });
      }
      for (const el of seitenInhalt(id, s.sid)) {
        const k = klon(el);
        k.id = kurzId(); k.m = Date.now();
        if (istKasten(k)) { k.x = r1(k.x + x); k.y = r1(k.y + y); }
        else k.p = k.p.map(q => { const c = q.slice(); c[0] = r1(q[0] + x); c[1] = r1(q[1] + y); return c; });
        e.push(k);
      }
      x += s.b + LUECKE;
      zeilenH = Math.max(zeilenH, s.h);
    });
    const neu = neueId(), sid = neueId();
    Bibliothek.speichere(neu, {
      art: 'notizbuch', papier: 'whiteboard', raster: r.raster, name: r.name, eltern: it.eltern || null, format: 'A4', farbe: it.farbe || 'blau',
      seiten: [sid], erstellt: Date.now(), geoeffnet: 0, seite: 1, favorit: false
    });
    if (e.length) Daten.set('ink:' + neu + ':' + sid, { e });
    meldung(`Whiteboard „${r.name}“ angelegt`, { text: 'Öffnen', fn: () => { location.hash = '#/dok/' + neu; } });
  }

  window.Umwandeln = { brettZuSeiten, seitenZuBrett, schneide };
})();
