'use strict';
// Kleine Bausteine für alle Bereiche: Dialoge, Meldungen, Zeitangaben, Dateien speichern
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------- Dialoge ---------- */

  const dlg = $('dialog');

  function oeffneDialog(html, { wert, init, klasse } = {}) {
    dlg.className = 'dialog' + (klasse ? ' ' + klasse : '');
    dlg.innerHTML = html;
    return new Promise(ok => {
      let erledigt = false;
      const fertig = w => {
        if (erledigt) return;
        erledigt = true;
        if (dlg.open) dlg.close();
        ok(w);
      };
      // Ein spätes close-Event eines vorherigen Dialogs darf diesen hier nicht schliessen
      dlg.onclose = () => { if (!dlg.open) fertig(null); };
      dlg.querySelectorAll('[data-abbrechen]').forEach(k => k.addEventListener('click', () => fertig(null)));
      dlg.querySelectorAll('[data-wahl]').forEach(k => k.addEventListener('click', () => fertig(k.dataset.wahl)));
      const form = dlg.querySelector('form');
      if (form) form.addEventListener('submit', e => { e.preventDefault(); fertig(wert ? wert(dlg) : true); });
      if (init) init(dlg, fertig);
      if (!dlg.open) dlg.showModal();
      const fokus = dlg.querySelector('[autofocus]');
      if (fokus) { fokus.focus(); if (fokus.select) fokus.select(); }
    });
  }

  function warteDialog(text) {
    dlg.onclose = null;
    dlg.className = 'dialog';
    dlg.innerHTML = `<div class="dialog-form"><p class="warten"><span class="kreisel" aria-hidden="true"></span><span id="warte-text">${esc(text)}</span></p></div>`;
    if (!dlg.open) dlg.showModal();
  }
  function warteText(text) { const el = $('warte-text'); if (el) el.textContent = text; }
  function schliesseDialog() { dlg.onclose = null; if (dlg.open) dlg.close(); }
  const dialogOffen = () => dlg.open;

  const knoepfe = (ok, gefahr) => `<div class="dialog-knoepfe">
      <button type="button" class="btn-leise" data-abbrechen>Abbrechen</button>
      <button type="submit" class="btn-primaer${gefahr ? ' gefahr' : ''}">${esc(ok)}</button>
    </div>`;

  function frageName(titel, wert, ok) {
    return oeffneDialog(`<form class="dialog-form">
        <h2>${esc(titel)}</h2>
        <label class="feld"><span>Name</span><input name="name" value="${esc(wert)}" required maxlength="120" autofocus autocomplete="off"></label>
        ${knoepfe(ok)}
      </form>`, { wert: d => d.querySelector('input').value.trim() || null });
  }

  function bestaetige(titel, text, ok) {
    return oeffneDialog(`<form class="dialog-form">
        <h2>${esc(titel)}</h2>
        <p>${text}</p>
        ${knoepfe(ok, true)}
      </form>`);
  }

  /* ---------- Meldungen ---------- */

  let meldungTimer = 0;
  function meldung(text, aktion) {
    let el = $('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = text;
    if (aktion) {
      const k = document.createElement('button');
      k.type = 'button';
      k.textContent = aktion.text;
      k.addEventListener('click', () => { el.classList.remove('da'); aktion.fn(); });
      el.appendChild(k);
    }
    el.classList.toggle('mit-aktion', !!aktion);
    el.classList.add('da');
    clearTimeout(meldungTimer);
    meldungTimer = setTimeout(() => el.classList.remove('da'), aktion ? 6000 : 3200);
  }

  /* ---------- Zeit und Grösse ---------- */

  function zeitText(ms) {
    if (!ms) return 'unbekannt';
    const d = new Date(ms), jetzt = new Date();
    const uhr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const tag = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((tag(jetzt) - tag(d)) / 864e5);
    if (diff === 0) return 'heute um ' + uhr;
    if (diff === 1) return 'gestern um ' + uhr;
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: d.getFullYear() === jetzt.getFullYear() ? undefined : 'numeric' }) + ' um ' + uhr;
  }
  const groesseText = b => b > 1e6 ? (b / 1e6).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';

  /* ---------- Dateien speichern ---------- */

  // Lernheft-App: direkt in den passenden Ordner. Auf claude.ai: über die Download-Freigabe. Sonst: normaler Download.
  const ORDNER = { original: 'Skripte', bearbeitet: 'Bearbeitete Skripte', notizbuch: 'Notizbücher' };
  async function speichereDatei(name, blob, art, pfad) {
    const b = window.lernheftDesktop;
    if (b && b.exportiere) {
      const ziel = await b.exportiere(art, pfad || [], name, await blob.arrayBuffer());
      meldung(`Gespeichert in „${ORDNER[art] || 'Lernheft'}“`, { text: 'Ordner öffnen', fn: () => b.zeigeDatei(ziel) });
      return;
    }
    if (window.claude && typeof window.claude.use === 'function') {
      const dl = await window.claude.use('downloads').catch(() => null);
      if (dl) {
        try { await dl.save({ filename: name, data: blob }); meldung('Datei gespeichert'); return; }
        catch (e) { if (e && e.code === 'declined') return; }
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 20000);
  }
  const dateiName = s => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Lernheft';

  // Startseite (Bibliothek): Schieber rechts wie in den Dokumenten, statt der Scrollleiste des Browsers. Unsichtbar,
  // erscheint nur beim Scrollen und verschwindet danach wieder; den Griff ziehen springt. Nur der Griff fängt
  // Eingaben ab, daneben scrollt der Finger die Seite ganz normal.
  (function seitenSchieber() {
    const s = document.createElement('div');
    s.className = 'seiten-schieber';
    s.hidden = true;
    s.innerHTML = '<div class="lw-schieber-griff" role="scrollbar" aria-orientation="vertical" aria-label="Durch die Bibliothek scrollen"></div>';
    const g = s.firstElementChild, RAND = 6;
    document.body.appendChild(s);
    let timer = 0, zieht = null;
    const wurzel = document.documentElement;
    const masse = () => {
      const kopf = document.querySelector('.app-kopf');
      const oben = kopf ? Math.max(0, kopf.getBoundingClientRect().bottom) : 0;
      const spur = innerHeight - oben - 2 * RAND, max = wurzel.scrollHeight - innerHeight;
      const gh = Math.max(44, Math.min(spur, spur * innerHeight / Math.max(1, wurzel.scrollHeight)));
      return { oben, spur, max, gh };
    };
    function zeigen() {
      s.classList.add('da');
      clearTimeout(timer);
      if (!zieht) timer = setTimeout(() => s.classList.remove('da'), 1100);
    }
    function lage(sichtbar) {
      const m = masse();
      const aktiv = m.max > 4 && wurzel.dataset.bereich === 'bibliothek';
      s.hidden = !aktiv;
      if (!aktiv) return;
      s.style.top = m.oben + 'px';
      g.style.height = m.gh + 'px';
      g.style.transform = `translateY(${RAND + Math.min(1, scrollY / m.max) * (m.spur - m.gh)}px)`;
      if (sichtbar) zeigen();
    }
    addEventListener('scroll', () => lage(true), { passive: true });
    addEventListener('resize', () => lage(false));
    if ('ResizeObserver' in window) new ResizeObserver(() => lage(false)).observe(document.body);
    new MutationObserver(() => lage(false)).observe(wurzel, { attributes: true, attributeFilter: ['data-bereich'] });
    g.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { g.setPointerCapture(e.pointerId); } catch (err) { /* ohne Festhalten */ }
      zieht = { id: e.pointerId, y0: e.clientY, s0: scrollY };
      s.classList.add('zieht');
      zeigen();
    });
    g.addEventListener('pointermove', e => {
      if (!zieht || e.pointerId !== zieht.id) return;
      const m = masse();
      scrollTo(0, zieht.s0 + (e.clientY - zieht.y0) / Math.max(1, m.spur - m.gh) * m.max);
    });
    const ende = e => { if (!zieht || e.pointerId !== zieht.id) return; zieht = null; s.classList.remove('zieht'); zeigen(); };
    g.addEventListener('pointerup', ende);
    g.addEventListener('pointercancel', ende);
    g.addEventListener('lostpointercapture', ende);
    lage(false);
  })();

  window.UI = {
    $, esc, neueId, oeffneDialog, warteDialog, warteText, schliesseDialog, dialogOffen, knoepfe, frageName, bestaetige,
    meldung, zeitText, groesseText, speichereDatei, dateiName
  };
})();
