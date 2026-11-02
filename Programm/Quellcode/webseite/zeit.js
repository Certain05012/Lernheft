'use strict';
// Lernzeit: wie lange das Lernheft benutzt wird, pro Tag und pro Skript oder Notizbuch.
// Gezählt wird nur, solange das Fenster im Vordergrund ist und in den letzten zwei Minuten etwas passiert ist.
// Gespeichert: "zeit:app" (Daten\app-daten.json) und "zeit:<id>" (in der Handschrift-Datei des Dokuments).
Daten.bereit.then(function () {
  const TAKT = 5;
  const RUHE = 120000;
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const klon = o => JSON.parse(JSON.stringify(o || {}));

  let letzte = Date.now();
  ['pointerdown', 'pointermove', 'keydown', 'wheel'].forEach(t => window.addEventListener(t, () => { letzte = Date.now(); }, { capture: true, passive: true }));

  let bereich = null;
  let puffer = { app: 0, mathe: 0, docs: {} };
  const hoerer = new Set();
  const melde = () => hoerer.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

  setInterval(() => {
    if (document.hidden || !document.hasFocus() || Date.now() - letzte > RUHE) return;
    puffer.app += TAKT;
    if (bereich === 'mathe') puffer.mathe += TAKT;
    else if (bereich && bereich.startsWith('dok:')) {
      const id = bereich.slice(4);
      puffer.docs[id] = (puffer.docs[id] || 0) + TAKT;
    }
    melde();
  }, TAKT * 1000);

  function sichern() {
    if (!puffer.app) return;
    const p = puffer;
    puffer = { app: 0, mathe: 0, docs: {} };
    const tag = iso(new Date());
    const a = klon(Daten.get('zeit:app', { tage: {} }));
    a.tage = a.tage || {};
    const t = a.tage[tag] || (a.tage[tag] = { s: 0 });
    t.s = (t.s || 0) + p.app;
    if (p.mathe) t.m = (t.m || 0) + p.mathe;
    for (const [id, s] of Object.entries(p.docs)) {
      t.d = (t.d || 0) + s;
      if (!Daten.get('bib:' + id)) continue;
      const z = klon(Daten.get('zeit:' + id, {}));
      z.sekunden = (z.sekunden || 0) + s;
      z.tage = z.tage || {};
      z.tage[tag] = (z.tage[tag] || 0) + s;
      z.zuletzt = Date.now();
      Daten.set('zeit:' + id, z);
    }
    Daten.set('zeit:app', a);
    document.dispatchEvent(new CustomEvent('zeit:gesichert'));
  }
  setInterval(sichern, 30000);
  window.addEventListener('pagehide', sichern);
  document.addEventListener('visibilitychange', () => { if (document.hidden) sichern(); });

  function dokZeit(id) {
    const z = Daten.get('zeit:' + id, {});
    return { sekunden: (z.sekunden || 0) + (puffer.docs[id] || 0), sitzungen: z.sitzungen || 0, zuletzt: z.zuletzt || 0, tage: z.tage || {} };
  }
  function appTage() {
    const tage = klon((Daten.get('zeit:app', {}).tage) || {});
    if (puffer.app) {
      const t = tage[iso(new Date())] || (tage[iso(new Date())] = { s: 0 });
      t.s = (t.s || 0) + puffer.app;
      t.m = (t.m || 0) + puffer.mathe;
    }
    return tage;
  }
  function text(sek) {
    const m = Math.floor((sek || 0) / 60);
    if (m < 1) return sek > 0 ? 'unter 1 min' : '0 min';
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }

  window.Zeit = {
    setzeBereich: b => { if (b !== bereich) { sichern(); bereich = b; } },
    sitzung(id) {
      const z = klon(Daten.get('zeit:' + id, {}));
      z.sitzungen = (z.sitzungen || 0) + 1;
      z.zuletzt = Date.now();
      Daten.set('zeit:' + id, z);
    },
    dokZeit, appTage, text, iso, sichern,
    // Angezeigt wird die Lernzeit nur, wenn sie in den Einstellungen eingeschaltet ist (gezählt wird immer)
    sichtbar: () => Daten.get('lokal:lernzeit', false) === true,
    on: fn => hoerer.add(fn)
  };
});
