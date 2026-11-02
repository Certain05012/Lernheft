'use strict';
// Die iPad-App stellt der Oberfläche dieselbe Brücke bereit wie die Windows-App (window.lernheftDesktop, preload.js):
// Schlüssel lesen und schreiben, Dateien, Papierkorb, Export. Dahinter arbeitet dieselbe Ablage (app/ablage.js), nur auf
// einem Dateisystem im Speicher des iPads (knoten.js, speicher.js), und der Abgleich mit OneDrive oder Dropbox
// (abgleich.js mit onedrive.js oder dropbox.js).
//
// Beim ersten Start zeigt die Brücke die Einrichtung (Cloud wählen, anmelden, Ordner, erster Abgleich), bevor die
// Oberfläche startet. Danach startet die App sofort aus dem Speicher des iPads, auch ohne Netz.
//
// Zum Testen im Browser am PC: npm run entwicklung (http://localhost:47830/). Mit ?attrappe=http://127.0.0.1:47831 arbeitet
// die App gegen die nachgebaute OneDrive- bzw. Dropbox-Schnittstelle (test/graph-attrappe.js), ohne Anmeldung.
(function () {
  const K = window.LHKonfig || {};
  const cap = window.Capacitor;
  const NATIV = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  // Web-App (ipad/baue.js web, z. B. auf GitHub Pages): läuft in Safari, offline über den Service Worker (pwa.js)
  const WEBAPP = !NATIV && !!window.LHWebApp;
  const plugin = n => (window.capacitorExports && NATIV ? capacitorExports.registerPlugin(n) : null);
  const App = NATIV ? window.capacitorApp.App : null;
  const Browser = NATIV ? window.capacitorBrowser.Browser : null;
  const Share = NATIV ? window.capacitorShare.Share : null;
  const Filesystem = NATIV && window.capacitorFilesystemPluginCapacitor ? window.capacitorFilesystemPluginCapacitor.Filesystem : null;
  const Http = NATIV ? (capacitorExports.CapacitorHttp || plugin('CapacitorHttp')) : null;
  // Sicherung in einen Ordner der Dateien-App (iCloud Drive): Swift-Modul ios/App/App/Sicherung.swift. Für Tests im
  // Browser kann window.LHOrdnerAttrappe denselben Zugang nachbilden.
  const Ordner = window.LHOrdnerAttrappe || (NATIV ? plugin('LHOrdner') : null);
  const suche = new URLSearchParams(location.search);
  const ATTRAPPE = suche.get('attrappe');
  const L = '/Lernheft';
  const LOKAL_DATEI = '/Geraet/geraet-einstellungen.json';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Die Clouds, mit denen die App abgleichen kann. modus in der Einrichtung = Schlüssel hier (oder 'lokal').
  const WOLKEN = {
    onedrive: { name: 'OneDrive', firma: 'Microsoft', idName: 'Anwendungs-ID (Client-ID)', id: () => K.clientId || '', pcOrdner: 'OneDrive\\Lernheft' },
    dropbox: { name: 'Dropbox', firma: 'Dropbox', idName: 'App-Schlüssel (App key)', id: () => K.dropboxAppKey || '', pcOrdner: 'Dropbox\\Lernheft' }
  };
  const istHomeBildschirm = () => !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  const istWolke = m => Object.prototype.hasOwnProperty.call(WOLKEN, m || '');
  const klon = v => (v === undefined ? v : typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

  /* ---------- Fehlerliste (ohne Mac lässt sich Safari auf dem iPad nicht untersuchen) ---------- */

  const protokoll = [];
  function notiere(art, text) {
    protokoll.push({ zeit: Date.now(), art, text: String(text).slice(0, 2000) });
    if (protokoll.length > 200) protokoll.splice(0, protokoll.length - 200);
    clearTimeout(notiere.t);
    notiere.t = setTimeout(() => { if (speicher) speicher.zustandSetz('protokoll', protokoll.slice(-200)).catch(() => {}); }, 1000);
  }
  window.addEventListener('error', e => notiere('Fehler', `${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
  window.addEventListener('unhandledrejection', e => notiere('Fehler', e.reason && (e.reason.stack || e.reason.message) || e.reason));
  const consoleError = console.error.bind(console);
  console.error = (...a) => { notiere('Fehler', a.map(x => (x && x.stack) || (typeof x === 'object' ? safeJson(x) : x)).join(' ')); consoleError(...a); };
  function safeJson(x) { try { return JSON.stringify(x); } catch (e) { return String(x); } }

  /* ---------- Speicher, Dateisystem, Cloud ---------- */

  const memfs = LHKnoten.erstelleSpeicherFs();
  const speicher = LHSpeicher.idb('lernheft-ipad');
  const zustand = { hol: k => speicher.zustandHol(k), setz: (k, v) => speicher.zustandSetz(k, v) };
  let sicherung = null, ablage = null, abgleich = null, anmeldung = null, drive = null, einrichtung = null, ordnerSicherung = null;
  // Gewählte Cloud (aus der Einrichtung; während der Einrichtung die, bei der gerade angemeldet wird)
  let anbieter = 'onedrive';
  const W = () => WOLKEN[anbieter] || WOLKEN.onedrive;
  const hoerer = new Set(), schliessHoerer = new Set(), statusHoerer = new Set();

  async function posteFormular(url, felder) {
    try {
      if (Http) {
        const r = await Http.request({ method: 'POST', url, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, data: felder });
        return { status: r.status, json: typeof r.data === 'string' ? JSON.parse(r.data || '{}') : r.data };
      }
      const r = await fetch(url, { method: 'POST', body: new URLSearchParams(felder) });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    } catch (e) {
      if (e instanceof SyntaxError) throw e;
      throw Object.assign(new Error('Keine Verbindung zu ' + W().firma), { offline: true });
    }
  }

  // Rückkehr von der Anmeldeseite in die App (nur iPad)
  let warteAufRueckkehr = null;
  if (NATIV) {
    App.addListener('appUrlOpen', ({ url }) => {
      if (!url || !url.startsWith(K.zurueckIos || 'ch.lernheft.app://')) return;
      Browser.close().catch(() => {});
      const w = warteAufRueckkehr;
      warteAufRueckkehr = null;
      anmeldung.rueckkehr(url).then(ok => w && w.ok(ok), e => w && w.fehler(e));
    });
    Browser.addListener('browserFinished', () => {
      // Der Nutzer hat die Anmeldeseite geschlossen, ohne fertig zu werden
      setTimeout(() => { const w = warteAufRueckkehr; if (w) { warteAufRueckkehr = null; w.fehler(new Error('Anmeldung abgebrochen.')); } }, 600);
    });
  }

  function erstelleAnmeldung(clientId) {
    return LHAnmeldung.erstelle({
      anbieter,
      clientId,
      zurueck: NATIV ? K.zurueckIos : location.origin + location.pathname.replace(/index\.html$/, ''),
      zustand,
      posteFormular,
      oeffne: async url => {
        if (NATIV) { await Browser.open({ url, presentationStyle: 'popover' }); return; }
        // Browser: die Seite verlässt die App. Vorher alles sichern und merken, wo man war (#/dok/…)
        await sichereAlles();
        await zustand.setz('rueck-hash', location.hash || '');
        location.assign(url);
      }
    });
  }

  // Web-App mit OneDrive: Microsoft lässt eine Anmeldung im Browser nur 24 Stunden gelten. Läuft sie bald ab, holt die
  // App sie still neu (kurz zu Microsoft und zurück, ohne Rückfrage, solange man dort angemeldet bleibt). Nie ohne Netz,
  // höchstens alle 30 Minuten ein Versuch. true = die Seite geht gleich zu Microsoft.
  async function erneuereStill(vorlauf) {
    if (NATIV || ATTRAPPE || !einrichtung || einrichtung.modus !== 'onedrive' || !anmeldung || navigator.onLine === false) return false;
    if (!(await anmeldung.laeuftAb(vorlauf))) return false;
    const zuletzt = await zustand.hol('still-versucht');
    if (zuletzt && Date.now() - zuletzt < 30 * 60e3) return false;
    await zustand.setz('still-versucht', Date.now());
    notiere('Anmeldung', 'Erneuere die Anmeldung bei Microsoft still');
    await anmeldung.anmelden('', true);
    return true;
  }
  // Anmelden; auf dem iPad bis zur Rückkehr warten (im Browser verlässt die Seite und kommt mit ?code= zurück)
  function melderAn() {
    return new Promise((ok, fehler) => {
      if (NATIV) warteAufRueckkehr = { ok, fehler };
      anmeldung.anmelden().catch(fehler);
    });
  }

  function erstelleAbgleich(ordner) {
    const token = ATTRAPPE ? async () => 'attrappe' : neu => anmeldung.token(neu);
    const attrappe = ATTRAPPE ? ATTRAPPE.replace(/\/$/, '') : null;
    drive = anbieter === 'dropbox'
      ? LHDropbox.erstelle({ basis: attrappe ? attrappe + '/dropbox' : undefined, inhalt: attrappe ? attrappe + '/dropbox-inhalt' : undefined, token })
      : LHOneDrive.erstelle({ basis: attrappe ? attrappe + '/v1.0' : undefined, token });
    abgleich = LHAbgleich.erstelle({
      fs: memfs, drive, zustand, lies: p => sicherung.lies(p), sichern: () => sicherung.flush(), lokal: L, ordner, name: W().name,
      melde: s => { for (const fn of statusHoerer) { try { fn(s); } catch (e) { /* Anzeige */ } } zeigeStatus(s); },
      protokoll: t => notiere('Abgleich', t)
    });
  }

  /* ---------- Start ---------- */

  const start = (async () => {
    sicherung = await LHSpeicher.verbinde(memfs, speicher);
    const altesProtokoll = await zustand.hol('protokoll').catch(() => null);
    if (Array.isArray(altesProtokoll)) protokoll.unshift(...altesProtokoll.slice(-100));
    einrichtung = await zustand.hol('einrichtung');
    const offen = await zustand.hol('einrichtung-offen');
    anbieter = einrichtung && istWolke(einrichtung.modus) ? einrichtung.modus : (offen && istWolke(offen.anbieter) ? offen.anbieter : 'onedrive');
    const clientId = (einrichtung && einrichtung.clientId) || (offen && offen.clientId) || W().id();
    anmeldung = erstelleAnmeldung(clientId);

    // Browser: Rückkehr von der Anmeldung (?code=…)
    let rueckkehrFehler = null;
    const zurueckGekommen = !NATIV && !!(suche.get('code') || suche.get('error'));
    if (zurueckGekommen) {
      try { await anmeldung.rueckkehr(location.href); } catch (e) { rueckkehrFehler = e; }
      const u = new URL(location.href);
      for (const k of ['code', 'state', 'error', 'error_description', 'session_state', 'client_info']) u.searchParams.delete(k);
      const hash = await zustand.hol('rueck-hash');
      await zustand.setz('rueck-hash', undefined);
      history.replaceState(null, '', u.pathname + (u.search || '') + (hash || u.hash));
      // Stille Anmeldung ging nicht: die App startet trotzdem, der Abgleich zeigt dann "bitte anmelden"
      if (rueckkehrFehler && rueckkehrFehler.still) { notiere('Anmeldung', 'Still ging nicht: ' + rueckkehrFehler.message); rueckkehrFehler = null; }
    }
    // Web-App: Anmeldung bei Microsoft vor Ablauf still erneuern (12 Stunden vorher, damit sie für einen Tag reicht)
    if (!zurueckGekommen && await erneuereStill(12 * 3600e3)) await new Promise(() => {});

    if (!einrichtung || (istWolke(einrichtung.modus) && !(await istBereitFuerStart()))) {
      await einrichten({ offen, fehler: rueckkehrFehler });
    }
    if (istWolke(einrichtung.modus) && !abgleichGeladen) {
      if (!abgleich) erstelleAbgleich(einrichtung.ordner);
      await abgleich.lade();
    }
    // format.js steht in index.html erst nach daten.js: warten, bis alle Skripte geladen sind
    if (document.readyState === 'loading') await new Promise(ok => document.addEventListener('DOMContentLoaded', ok, { once: true }));
    // Das iPad hat keine Daten aus der Zeit vor dem Lernheft ("mathe-des-tages:…"). Ohne diese Marke würde daten.js die
    // alten Einträge aus app-daten.json noch einmal übernehmen und am PC längst gelöschte Dokumente zurückholen.
    if (!memfs.existsSync(LOKAL_DATEI)) {
      memfs.mkdirSync(LOKAL_DATEI.slice(0, LOKAL_DATEI.lastIndexOf('/')), { recursive: true });
      memfs.writeFileSync(LOKAL_DATEI, JSON.stringify({ 'lokal:migriert-v2': true }));
    }
    const u = LHKnoten.umgebung(memfs);
    ablage = window.LHAblageFabrik(u.require, u.Buffer).erstelleAblage({ wurzel: L, melde: verteile, format: LHFormat, lokalDatei: LOKAL_DATEI });
    if (abgleich) abgleich.starte(K.abgleichAlleMs || 30000);
    if (Ordner) {
      ordnerSicherung = LHSicherung.erstelle({
        fs: memfs, ordner: Ordner, ablage: () => ablage, liesGross: p => sicherung.lies(p), sichern: () => sicherung.flush(),
        zustand, lokal: L, protokoll: t => notiere('Sicherung', t)
      });
      // Automatisch: kurz nach dem Start, alle 30 Minuten und beim Wechsel in den Hintergrund (siehe unten)
      setTimeout(() => ordnerSicherung.sichereWennFaellig(10 * 60e3), 60e3);
      setInterval(() => ordnerSicherung.sichereWennFaellig(30 * 60e3), 30 * 60e3);
    }
    return ablage;
  })();
  start.catch(e => { console.error('Lernheft: Start', e); zeigeStartFehler(e); });

  // Schon einmal ganz abgeglichen? Dann startet die App sofort aus dem Speicher des iPads
  let abgleichGeladen = false;
  async function istBereitFuerStart() {
    erstelleAbgleich(einrichtung.ordner);
    const ok = await abgleich.lade();
    abgleichGeladen = ok;
    return ok;
  }

  function verteile(aenderungen) {
    const a = klon(aenderungen);
    for (const fn of hoerer) { try { fn(a); } catch (e) { console.error(e); } }
  }

  /* ---------- Einrichtung (erster Start) ---------- */

  let huelle = null;
  function zeigeHuelle(html) {
    if (!huelle) {
      const stil = document.createElement('style');
      stil.textContent = `
        .lh-ein { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: var(--papier, #0d1322);
          color: var(--tinte, #e6eaf2); font-family: var(--f-text, system-ui, sans-serif); overflow: auto; }
        .lh-ein-karte { width: min(520px, 100%); display: flex; flex-direction: column; gap: 14px; padding: 28px; border-radius: 18px;
          background: var(--blatt, #151d30); border: 1px solid var(--linie, #26324b); box-shadow: var(--schatten, none); }
        .lh-ein h1 { margin: 0; font-family: var(--f-display, system-ui); font-size: 28px; }
        .lh-ein p { margin: 0; line-height: 1.5; }
        .lh-ein .klein { font-size: 14px; color: var(--grau, #9ba5ba); }
        .lh-ein .fehler { color: var(--rotstift, #ff7266); font-weight: 700; }
        .lh-ein .knoepfe { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
        .lh-ein .knoepfe .btn-primaer, .lh-ein .knoepfe .btn-leise { min-height: 46px; }
        .lh-ein details summary { cursor: pointer; color: var(--grau, #9ba5ba); }
        .lh-ein details .feld { margin-top: 10px; }
        .lh-ein .kreisel { display: inline-block; width: 18px; height: 18px; vertical-align: -3px; margin-right: 8px; border-radius: 50%;
          border: 2.5px solid var(--linie, #26324b); border-top-color: var(--fueller, #8aabff); animation: lh-dreh 0.9s linear infinite; }
        @keyframes lh-dreh { to { transform: rotate(360deg); } }`;
      document.head.appendChild(stil);
      huelle = document.createElement('div');
      huelle.className = 'lh-ein';
      document.body.appendChild(huelle);
    }
    huelle.innerHTML = `<div class="lh-ein-karte">${html}</div>`;
    return huelle;
  }
  function entferneHuelle() { if (huelle) { huelle.remove(); huelle = null; } }
  const warteAuf = (el, sel) => new Promise(ok => el.querySelectorAll(sel).forEach(k => k.addEventListener('click', () => ok(k.dataset.wahl), { once: true })));

  async function einrichten({ offen, fehler }) {
    let ordner = (offen && offen.ordner) || K.ordner || 'Lernheft';
    // Die IDs beider Clouds (eine davon kann aus einer abgebrochenen Anmeldung stammen)
    const ids = { onedrive: WOLKEN.onedrive.id(), dropbox: WOLKEN.dropbox.id() };
    if (offen && offen.clientId && istWolke(offen.anbieter || 'onedrive')) ids[offen.anbieter || 'onedrive'] = offen.clientId;
    let meldung = fehler ? fehler.message : '';
    // Kommt die Seite gerade von der Anmeldung zurück (Browser), geht es direkt beim Ordner weiter
    let schritt = offen && !fehler && (ATTRAPPE || await anmeldung.angemeldet()) ? 'ordner' : 'start';
    const merkeOffen = () => zustand.setz('einrichtung-offen', { anbieter, ordner, clientId: ids[anbieter] });
    for (;;) {
      if (schritt === 'start') {
        const fehlt = Object.keys(WOLKEN).filter(a => !ids[a]);
        const h = zeigeHuelle(`
          <h1>Lernheft</h1>
          <p>Verbinde das Lernheft mit deinem OneDrive oder deiner Dropbox, mit demselben Ordner wie am PC. Dann hast du auf dem iPad dieselben Skripte und Notizbücher, und alles, was du hier schreibst, kommt auch dort an.</p>
          <p class="klein">Danach läuft alles auch ohne Netz. Abgeglichen wird, sobald das iPad wieder online ist.</p>
          ${WEBAPP && !istHomeBildschirm() ? '<p class="klein"><strong>Tipp:</strong> Lege das Lernheft zuerst auf den Home-Bildschirm (in Safari: Teilen-Knopf › „Zum Home-Bildschirm“) und richte es dort ein. Safari hält die Daten der App auf dem Home-Bildschirm getrennt von den Tabs und löscht sie dort nicht nach einigen Wochen ohne Besuch.</p>' : ''}
          ${meldung ? `<p class="fehler">${esc(meldung)}</p>` : ''}
          ${fehlt.length === 2 && !ATTRAPPE ? '<p class="klein">Für die Anmeldung braucht die App eine Kennung von Microsoft bzw. Dropbox (siehe Anleitung). Trage sie unter „Erweitert“ ein.</p>' : ''}
          <div class="knoepfe">
            <button type="button" class="btn-primaer" data-wahl="onedrive">${ATTRAPPE ? 'Mit Test-OneDrive verbinden' : 'Mit OneDrive anmelden'}</button>
            <button type="button" class="btn-primaer" data-wahl="dropbox">${ATTRAPPE ? 'Mit Test-Dropbox verbinden' : 'Mit Dropbox anmelden'}</button>
            <button type="button" class="btn-leise" data-wahl="lokal">Ohne Cloud nutzen</button>
          </div>
          <details ${fehlt.length === 2 && !ATTRAPPE ? 'open' : ''}><summary>Erweitert</summary>
            <label class="feld"><span>Ordner in der Cloud</span><input name="ordner" value="${esc(ordner)}" autocomplete="off" autocapitalize="off"></label>
            <label class="feld"><span>OneDrive: ${esc(WOLKEN.onedrive.idName)}</span><input name="onedrive" value="${esc(ids.onedrive)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
            <label class="feld"><span>Dropbox: ${esc(WOLKEN.dropbox.idName)}</span><input name="dropbox" value="${esc(ids.dropbox)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
          </details>`);
        const wahl = await warteAuf(h, '[data-wahl]');
        ordner = (h.querySelector('[name="ordner"]').value || 'Lernheft').trim().replace(/^\/+|\/+$/g, '');
        for (const a of Object.keys(WOLKEN)) ids[a] = h.querySelector(`[name="${a}"]`).value.trim();
        if (wahl === 'lokal') {
          einrichtung = { modus: 'lokal' };
          await zustand.setz('einrichtung', einrichtung);
          entferneHuelle();
          return;
        }
        anbieter = wahl;
        if (!ids[anbieter] && !ATTRAPPE) {
          meldung = `Ohne ${W().idName} von ${W().firma} geht die Anmeldung nicht (siehe Anleitung). Trage sie unter „Erweitert“ ein.`;
          continue;
        }
        await merkeOffen();
        if (ATTRAPPE) { schritt = 'ordner'; continue; }
        anmeldung = erstelleAnmeldung(ids[anbieter]);
        zeigeHuelle(`<p><span class="kreisel"></span>Anmeldung bei ${esc(W().firma)} …</p>`);
        try { await melderAn(); schritt = 'ordner'; } catch (e) { meldung = e.message; }
        continue;
      }
      if (schritt === 'ordner') {
        zeigeHuelle(`<p><span class="kreisel"></span>Suche den Ordner „${esc(ordner)}“ in ${esc(W().name)} …</p>`);
        erstelleAbgleich(ordner);
        let el;
        try {
          if (!ATTRAPPE) { const lw = await drive.laufwerk(); await anmeldung.setzeKonto(lw.owner && lw.owner.user ? lw.owner.user.displayName : ''); }
          el = await abgleich.waehleOrdner(false);
        } catch (e) { meldung = e.message; schritt = e.anmelden ? 'start' : 'fehler'; continue; }
        if (!el) {
          const h = zeigeHuelle(`
            <h1>Ordner fehlt</h1>
            <p>In ${esc(W().name)} gibt es keinen Ordner „${esc(ordner)}“. Am PC liegt der Lernheft-Ordner meist unter <em>${esc(W().pcOrdner)}</em>. Wähle dort im Lernheft unter Menü › Speicherort einen Ordner in ${esc(W().name)}, oder lege hier einen neuen an.</p>
            <label class="feld"><span>Ordner in ${esc(W().name)}</span><input name="ordner" value="${esc(ordner)}" autocomplete="off" autocapitalize="off"></label>
            <div class="knoepfe">
              <button type="button" class="btn-primaer" data-wahl="suchen">Nochmal suchen</button>
              <button type="button" class="btn-leise" data-wahl="anlegen">Neu anlegen</button>
            </div>`);
          const wahl = await warteAuf(h, '[data-wahl]');
          ordner = (h.querySelector('[name="ordner"]').value || 'Lernheft').trim().replace(/^\/+|\/+$/g, '');
          await merkeOffen();
          if (wahl === 'anlegen') {
            try { erstelleAbgleich(ordner); await abgleich.waehleOrdner(true); } catch (e) { meldung = e.message; schritt = 'fehler'; continue; }
          } else continue;
        }
        schritt = 'laden';
        continue;
      }
      if (schritt === 'laden') {
        zeigeHuelle(`<h1>Erster Abgleich</h1><p id="lh-ein-text"><span class="kreisel"></span>Lade die Bibliothek aus ${esc(W().name)} …</p>
          <p class="klein">Die PDFs der Skripte kommen danach im Hintergrund. Lass die App dafür eine Weile offen.</p>`);
        const zeige = s => { const t = document.getElementById('lh-ein-text'); if (t && s.text) t.innerHTML = '<span class="kreisel"></span>' + esc(s.text); };
        statusHoerer.add(zeige);
        try { await abgleich.ersteRunde(); }
        catch (e) { statusHoerer.delete(zeige); meldung = e.offline ? 'Keine Verbindung. Für den ersten Abgleich braucht das iPad Internet.' : e.message; schritt = 'fehler'; continue; }
        statusHoerer.delete(zeige);
        einrichtung = { modus: anbieter, ordner, clientId: ids[anbieter] };
        await zustand.setz('einrichtung', einrichtung);
        await zustand.setz('einrichtung-offen', undefined);
        entferneHuelle();
        return;
      }
      if (schritt === 'fehler') {
        const h = zeigeHuelle(`<h1>Das hat nicht geklappt</h1><p class="fehler">${esc(meldung)}</p>
          <div class="knoepfe"><button type="button" class="btn-primaer" data-wahl="nochmal">Nochmal</button><button type="button" class="btn-leise" data-wahl="zurueck">Zurück</button></div>`);
        const wahl = await warteAuf(h, '[data-wahl]');
        schritt = wahl === 'nochmal' ? 'ordner' : 'start';
        if (wahl === 'zurueck') meldung = '';
      }
    }
  }

  function zeigeStartFehler(e) {
    zeigeHuelle(`<h1>Das Lernheft konnte nicht starten</h1><p class="fehler">${esc(e && e.message)}</p>
      <p class="klein">Deine Daten in der Cloud sind davon nicht betroffen.</p>
      <div class="knoepfe"><button type="button" class="btn-primaer" onclick="location.reload()">Neu laden</button></div>`);
  }

  /* ---------- Anzeige des Abgleichs (Menü) ---------- */

  const STATUS = { bereit: 'abgeglichen', laeuft: 'gleicht ab …', offline: 'offline', fehler: 'Fehler', anmelden: 'bitte anmelden' };
  const statusText = z => (STATUS[z] ? `${W().name}: ${STATUS[z]}` : W().name);
  function zeigeStatus(s) {
    const k = document.getElementById('sync-status');
    if (!k) return;
    const span = k.querySelector('span');
    let text = statusText(s.zustand);
    if (s.zustand === 'bereit' && s.offen) text = `${W().name}: ${s.offen} offen`;
    if (s.fehler && /anmelden/i.test(s.fehler)) text = statusText('anmelden');
    if (span) span.textContent = text;
    k.dataset.abgleich = s.zustand;
  }

  /* ---------- Dialog „OneDrive“ bzw. „Dropbox“ (Menü › Speicherort, Einstellungen) ---------- */

  async function zeigeDialog() {
    await start;
    const U = window.UI;
    if (!abgleich) {
      const wahl = await U.oeffneDialog(`<div class="dialog-form">
          <h2>Speicher</h2>
          <p class="dialog-klein">Die Bibliothek liegt nur auf diesem iPad, ohne Abgleich. Verbinde sie mit OneDrive oder Dropbox, dann hast du sie auch am PC (deine Notizen hier bleiben erhalten und kommen dazu).</p>
          <div class="ort-aktionen"><button type="button" class="btn-primaer" data-wahl="verbinden">Mit OneDrive oder Dropbox verbinden …</button>
          <button type="button" class="btn-leise" data-wahl="sicherung">Sicherung (iCloud) …</button>
          <button type="button" class="btn-leise" data-wahl="protokoll">Fehlerliste</button></div>
          <div class="dialog-knoepfe"><button type="button" class="btn-leise" data-abbrechen>Schliessen</button></div></div>`);
      if (wahl === 'verbinden') { await zustand.setz('einrichtung', undefined); location.reload(); }
      if (wahl === 'sicherung') zeigeSicherung();
      if (wahl === 'protokoll') zeigeProtokoll();
      return;
    }
    const s = abgleich.status();
    const konto = await anmeldung.konto();
    const zeit = s.zuletzt ? new Date(s.zuletzt).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nie';
    const offen = abgleich.offen();
    const wahl = await U.oeffneDialog(`<div class="dialog-form">
        <h2>${esc(W().name)}</h2>
        <dl class="sync-liste">
          <dt>Konto</dt><dd>${esc(ATTRAPPE ? 'Test-' + W().name + ' (' + ATTRAPPE + ')' : konto || 'angemeldet')}</dd>
          <dt>Ordner</dt><dd>${esc(W().name)} › ${esc(einrichtung.ordner)}</dd>
          <dt>Abgleich</dt><dd>${esc(statusText(s.zustand))}${s.text && s.zustand !== 'bereit' ? ' – ' + esc(s.text) : ''}. Zuletzt: ${esc(zeit)}.</dd>
          <dt>Offen</dt><dd>${offen.hoch.length} hochzuladen, ${offen.ops.length} verschieben/löschen, ${offen.laden.length} PDFs zu laden</dd>
        </dl>
        <p class="dialog-klein">Abgeglichen wird automatisch, solange die App offen ist (alle ${Math.round((K.abgleichAlleMs || 30000) / 1000)} s und nach jeder Änderung). Haben iPad und PC dieselbe Seite geändert, werden beide Fassungen zusammengeführt.</p>
        <div class="ort-aktionen">
          <button type="button" class="btn-primaer" data-wahl="jetzt">Jetzt abgleichen</button>
          ${s.zustand === 'anmelden' || (s.fehler && /anmelden/i.test(s.fehler)) ? '<button type="button" class="btn-primaer" data-wahl="anmelden">Neu anmelden</button>' : ''}
          <button type="button" class="btn-leise" data-wahl="sicherung">Sicherung (iCloud) …</button>
          <button type="button" class="btn-leise" data-wahl="protokoll">Fehlerliste</button>
          <button type="button" class="btn-leise" data-wahl="abmelden">Abmelden …</button>
        </div>
        <div class="dialog-knoepfe"><button type="button" class="btn-leise" data-abbrechen>Schliessen</button></div>
      </div>`);
    if (wahl === 'jetzt') { U.meldung('Abgleich läuft …'); await abgleich.jetzt(); const n = abgleich.status(); U.meldung(n.zustand === 'bereit' ? 'Abgeglichen' : n.text || statusText(n.zustand)); }
    else if (wahl === 'anmelden') {
      try { await melderAn(); U.meldung('Angemeldet'); abgleich.jetzt(); } catch (e) { U.meldung(e.message); }
    } else if (wahl === 'protokoll') zeigeProtokoll();
    else if (wahl === 'sicherung') zeigeSicherung();
    else if (wahl === 'abmelden') {
      const n = offen.hoch.length + offen.ops.length;
      const ok = await U.bestaetige(`Von ${W().name} abmelden?`, `Die Bibliothek bleibt auf diesem iPad, es wird nur nicht mehr abgeglichen.${n ? ` Achtung: ${n} Änderungen sind noch nicht in ${W().name}.` : ''} Beim nächsten Start kannst du dich wieder anmelden (auch bei der anderen Cloud).`, 'Abmelden');
      if (!ok) return;
      abgleich.halte();
      await anmeldung.abmelden();
      await zustand.setz('einrichtung', undefined);
      location.reload();
    }
  }

  /* ---------- Dialog „Sicherung“: in einen Ordner der Dateien-App (iCloud Drive), als Datei, wiederherstellen ---------- */

  const zeitText = ms => (ms ? new Date(ms).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nie');
  async function zeigeSicherung() {
    await start;
    const U = window.UI;
    const st = ordnerSicherung ? await ordnerSicherung.status() : null;
    const ort = st && st.gewaehlt ? `${st.name}` : '';
    const wahl = await U.oeffneDialog(`<div class="dialog-form">
        <h2>Sicherung</h2>
        ${ordnerSicherung ? `
        <dl class="sync-liste">
          <dt>Ordner</dt><dd>${ort ? esc(ort) : 'noch keiner gewählt'}</dd>
          <dt>Zuletzt</dt><dd>${esc(zeitText(st.zuletzt))}${st.fehler ? ` – <span style="color:var(--rotstift)">${esc(st.fehler)}</span>` : ''}</dd>
        </dl>
        <p class="dialog-klein">Wähle einen Ordner in iCloud Drive (z. B. „Lernheft-Sicherung“). Dorthin sichert die App automatisch eine vollständige Kopie des Lernhefts samt PDFs (nur was sich geändert hat) und je Tag alle Notizen in einer Datei; die der letzten 30 Tage bleiben. Das geht auch ohne OneDrive oder Dropbox.</p>
        <div class="ort-aktionen">
          <button type="button" class="btn-primaer" data-wahl="waehlen">${ort ? 'Anderen Ordner wählen …' : 'Ordner in iCloud Drive wählen …'}</button>
          ${ort ? '<button type="button" class="btn-primaer" data-wahl="jetzt">Jetzt sichern</button><button type="button" class="btn-leise" data-wahl="zurueck">Wiederherstellen …</button>' : ''}
        </div>` : WEBAPP ? `
        <dl class="sync-liste"><dt>Zuletzt</dt><dd>${esc(zeitText(await zustand.hol('datei-gesichert')))}</dd></dl>
        <p class="dialog-klein">Sichere alle Notizen in eine Datei: „Als Datei sichern …“, dann „In Dateien sichern“ › iCloud Drive (z. B. Ordner „Lernheft-Sicherung“). Am PC mit iCloud für Windows liegt sie dann im iCloud-Drive-Ordner; das Lernheft dort importiert sie unter Menü › Speicherort › Sicherung importieren. Automatisch in iCloud Drive sichern kann eine Web-App nicht (das erlaubt Safari nicht), den automatischen Abgleich mit dem PC macht OneDrive bzw. Dropbox.</p>` : `<p class="dialog-klein">Sichere alle Notizen in eine Datei und lege sie in der Dateien-App ab, z. B. in iCloud Drive (die automatische Sicherung in einen Ordner braucht die aktuelle iPad-App).</p>`}
        <div class="ort-aktionen">
          <button type="button" class="btn-leise" data-wahl="teilen">Als Datei sichern …</button>
          <button type="button" class="btn-leise" data-wahl="import">Sicherung importieren …</button>
        </div>
        <p class="dialog-klein">Die Datei (.lernheft) enthält alle Notizen und Einstellungen, ohne PDFs. Importieren führt sie mit dem Vorhandenen zusammen, nichts wird überschrieben. Auch das Lernheft am PC kann sie importieren.</p>
        <div class="dialog-knoepfe"><button type="button" class="btn-leise" data-abbrechen>Schliessen</button></div>
      </div>`);
    const fehler = e => { if (e && /abgebrochen/i.test(e.message || '')) return; U.meldung((e && e.message) || 'Das hat nicht geklappt.'); };
    if (wahl === 'waehlen') {
      try {
        const r = await Ordner.waehle();
        await ordnerSicherung.vergiss();
        U.meldung(`Sichere nach „${r.name}“ …`);
        const b = await ordnerSicherung.sichere({ tagesSicherung: true });
        U.meldung(`Gesichert: ${b.geschrieben} Dateien`);
      } catch (e) { fehler(e); }
    } else if (wahl === 'jetzt') {
      U.meldung('Sicherung läuft …');
      try { const b = await ordnerSicherung.sichere(); U.meldung(b.geschrieben ? `Gesichert: ${b.geschrieben} ${b.geschrieben === 1 ? 'Datei' : 'Dateien'}` : 'Gesichert, alles war schon da'); } catch (e) { fehler(e); }
    } else if (wahl === 'zurueck') {
      let liste = [];
      try { liste = await ordnerSicherung.tagesSicherungen(); } catch (e) { fehler(e); return; }
      if (!liste.length) { U.meldung('Im Ordner gibt es noch keine Sicherung.'); return; }
      const datum = liste[0].replace(/^Lernheft-Sicherung (.+)\.lernheft$/, '$1');
      const ok = await U.bestaetige('Wiederherstellen?', `Die neueste Sicherung (${datum}) wird mit dem Lernheft auf diesem iPad zusammengeführt. Nichts wird überschrieben oder gelöscht; fehlende PDFs kommen aus der Kopie im Ordner.`, 'Wiederherstellen');
      if (!ok) return;
      U.meldung('Stelle wieder her …');
      try { const b = await ordnerSicherung.wiederherstellen(liste[0]); U.meldung(`Zusammengeführt: ${b.dokumente} Dokumente (${b.neu} neu), ${b.pdfs} PDFs`); } catch (e) { fehler(e); }
    } else if (wahl === 'teilen') {
      try {
        const ab = await start;
        const r = await teile([{ name: `Lernheft-Sicherung ${new Date().toISOString().slice(0, 10)}.lernheft`, daten: new Uint8Array(ab.exportiereAlles()) }]);
        if (r && r.geteilt) await zustand.setz('datei-gesichert', Date.now());
      } catch (e) { fehler(e); }
    } else if (wahl === 'import') {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.onchange = async () => {
        if (!inp.files[0]) return;
        try {
          const b = (await start).importiereAlles(new Uint8Array(await inp.files[0].arrayBuffer()));
          U.meldung(`Zusammengeführt: ${b.dokumente} Dokumente (${b.neu} neu), ${b.seiten} Seiten`);
        } catch (e) { fehler(e); }
      };
      inp.click();
    }
  }

  async function zeigeProtokoll() {
    const U = window.UI;
    const zeilen = protokoll.slice().reverse().map(p => `${new Date(p.zeit).toLocaleString('de-CH')}  ${p.art}: ${p.text}`);
    const text = zeilen.join('\n') || 'Keine Einträge.';
    const wahl = await U.oeffneDialog(`<div class="dialog-form breit">
        <h2>Fehlerliste</h2>
        <p class="dialog-klein">Was die App seit dem Start bemerkt hat (neueste zuerst). Zum Weitergeben kopieren.</p>
        <textarea readonly style="width:100%;min-height:280px;font:12px/1.4 ui-monospace,Menlo,monospace;background:var(--papier);color:var(--tinte);border:1px solid var(--linie);border-radius:8px;padding:8px">${esc(text)}</textarea>
        <div class="dialog-knoepfe"><button type="button" class="btn-leise" data-wahl="leeren">Leeren</button><button type="button" class="btn-leise" data-wahl="kopieren">Kopieren</button><button type="button" class="btn-primaer" data-abbrechen>Schliessen</button></div>
      </div>`);
    if (wahl === 'kopieren') { try { await navigator.clipboard.writeText(text); U.meldung('Kopiert'); } catch (e) { U.meldung('Kopieren ging nicht'); } }
    if (wahl === 'leeren') { protokoll.length = 0; zustand.setz('protokoll', []); }
  }

  /* ---------- Export: Teilen-Menü (Sichern in Dateien, AirDrop, Mail …) ---------- */

  function alsBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const typVon = name => ({ pdf: 'application/pdf', png: 'image/png', lernheft: 'application/octet-stream' })[String(name || '').split('.').pop().toLowerCase()] || 'application/octet-stream';
  async function teile(dateien) {
    if (!dateien || !dateien.length) return { abgebrochen: true };
    if (NATIV && Share && Filesystem) {
      const uris = [];
      for (const d of dateien) {
        const name = String(d.name || 'Export').replace(/[\\/:*?"<>|]+/g, '-');
        const r = await Filesystem.writeFile({ path: 'Export/' + name, data: alsBase64(new Uint8Array(d.daten)), directory: 'CACHE', recursive: true });
        uris.push(r.uri);
      }
      try { await Share.share({ files: uris, title: dateien.length === 1 ? dateien[0].name : dateien.length + ' Dateien' }); }
      catch (e) { if (/cancel/i.test(e && e.message)) return { abgebrochen: true }; throw e; }
      return { geteilt: true, dateien: dateien.map(d => d.name), ordner: '' };
    }
    // Web-App auf dem iPad: Teilen-Menü von Safari (In Dateien sichern → iCloud Drive, AirDrop, Mail …). Safari erlaubt
    // das nur kurz nach einem Tippen; dauert die Vorbereitung zu lange (NotAllowedError), wird heruntergeladen.
    if (WEBAPP && navigator.share && navigator.canShare && window.File) {
      const files = dateien.map(d => new File([d.daten], String(d.name || 'Export').replace(/[\\/:*?"<>|]+/g, '-'), { type: d.typ || typVon(d.name) }));
      if (navigator.canShare({ files })) {
        try {
          await navigator.share({ files, title: dateien.length === 1 ? dateien[0].name : dateien.length + ' Dateien' });
          return { geteilt: true, dateien: dateien.map(d => d.name), ordner: '' };
        } catch (e) {
          if (e && e.name === 'AbortError') return { abgebrochen: true };
          if (!(e && e.name === 'NotAllowedError')) throw e;
        }
      }
    }
    // Browser: herunterladen (Safari legt die Datei unter Downloads ab, das liegt meist in iCloud Drive)
    for (const d of dateien) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([d.daten]));
      a.download = d.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    }
    return { geteilt: true, dateien: dateien.map(d => d.name), ordner: '' };
  }

  /* ---------- App in den Hintergrund: alles sichern ---------- */

  async function sichereAlles() {
    for (const fn of schliessHoerer) { try { fn(); } catch (e) { console.error(e); } }
    try { if (window.Daten) Daten.flush(); } catch (e) { /* weiter */ }
    await new Promise(ok => setTimeout(ok, 0));
    try { if (ablage) ablage.sichern(); } catch (e) { console.error('Lernheft: sichern', e); }
    try { if (sicherung) await sicherung.flush(); } catch (e) { console.error('Lernheft: sichern', e); }
  }
  if (NATIV) {
    App.addListener('pause', () => {
      sichereAlles().then(() => {
        if (abgleich) abgleich.jetzt();
        if (ordnerSicherung) ordnerSicherung.sichereWennFaellig(10 * 60e3);
      });
    });
    App.addListener('resume', () => { if (abgleich) abgleich.jetzt(); });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { sichereAlles(); return; }
    // Web-App nach einer Pause: ist die Anmeldung bei Microsoft (fast) abgelaufen, still erneuern, sonst abgleichen
    start.then(() => erneuereStill(3600e3)).then(weg => { if (!weg && abgleich) abgleich.jetzt(); }).catch(e => notiere('Anmeldung', e && e.message));
  });
  window.addEventListener('online', () => { if (abgleich) abgleich.jetzt(); });

  /* ---------- Die Brücke ---------- */

  window.lernheftDesktop = {
    version: 3,
    lokal: true,
    ipad: true,
    geraet: NATIV ? 'Lernheft (iPad)' : WEBAPP ? 'Lernheft (Web-App)' : 'Lernheft (Browser)',
    webApp: WEBAPP,
    get wurzel() { return abgleich && einrichtung ? `${W().name} › ${einrichtung.ordner}` : 'iPad'; },
    speicherText: () => (abgleich ? `Alles liegt auf diesem iPad und in ${W().name} im Ordner „${einrichtung.ordner}“.` : 'Alles liegt nur auf diesem iPad.'),
    kv: {
      alle: async () => klon((await start).alle()),
      setze: aenderungen => { const a = klon(aenderungen); start.then(ab => ab.setze(a)); },
      aufAenderung: fn => { hoerer.add(fn); }
    },
    vorSchliessen: fn => { schliessHoerer.add(fn); },
    datei: {
      async get(k) {
        const ab = await start;
        const p = ab.datei.pfad(k);
        if (!p) return null;
        const kn = memfs.knoten.get(p);
        if (kn && kn.fehlt && abgleich) return abgleich.ladeDatei(p);
        return sicherung.lies(p);
      },
      async put(k, daten) { (await start).datei.put(k, daten); return true; },
      async del(k) { (await start).datei.del(k); return true; },
      async liste() { return []; }
    },
    papierkorb: {
      liste: async () => (await start).papierkorb.liste(),
      zurueck: async name => { try { return (await start).papierkorb.zurueck(String(name)); } catch (e) { return { fehler: e.message }; } },
      loeschen: async name => { try { return (await start).papierkorb.loeschen(String(name)); } catch (e) { return { fehler: e.message }; } },
      leeren: async () => { try { return (await start).papierkorb.leeren(); } catch (e) { return { fehler: e.message }; } }
    },
    speichereUnter: dateien => teile(dateien),
    wolke: {
      // Name für die Anzeige (Knopf im Menü): die gewählte Cloud, ohne Cloud "Speicher"
      get name() { return einrichtung && !istWolke(einrichtung.modus) ? 'Speicher' : W().name; },
      zeigeDialog,
      status: () => (abgleich ? abgleich.status() : { zustand: 'aus' }),
      jetzt: () => abgleich && abgleich.jetzt(),
      aufStatus: fn => { statusHoerer.add(fn); }
    },
    sicherungOrdner: { zeigeDialog: zeigeSicherung, jetzt: o => ordnerSicherung && ordnerSicherung.sichere(o), status: () => (ordnerSicherung ? ordnerSicherung.status() : null) },
    // Für Tests
    _intern: { memfs, sicherung: () => sicherung, abgleich: () => abgleich, ablage: () => ablage, ordnerSicherung: () => ordnerSicherung, protokoll, start }
  };
})();
