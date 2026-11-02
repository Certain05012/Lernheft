'use strict';
// Navigation (Bibliothek und Dokumente), Hell/Dunkel, Einstellungen und der Weg zum Lernheft-Ordner
Daten.bereit.then(function () {
  const { $, esc } = UI;
  const wurzel = document.documentElement;
  const B = window.lernheftDesktop || null;

  /* ---------- Hell / Dunkel ---------- */

  function setzeThema(t) {
    wurzel.dataset.theme = t === 'light' ? 'light' : 'dark';
    $('thema-knopf').querySelector('span').textContent = t === 'light' ? 'Dunkles Design' : 'Helles Design';
    setzeBibHg();
  }

  /* ---------- Farben: ein Farbsatz für Startseite, Kopfleiste und Dokumente ---------- */

  // Hell ist immer Weiss; im dunklen Design wählt man Dunkelgrau oder Dunkelblau (lokal:bib-hintergrund, Standard Dunkelblau)
  const BIB_HG = { dunkelgrau: 'Dunkelgrau', dunkelblau: 'Dunkelblau', weiss: 'Hell' };
  const BIB_HG_FARBE = { dunkelgrau: '#2a2c30', dunkelblau: '#0d1322', weiss: '#dde5f0' };
  const bibHg = () => {
    if (wurzel.dataset.theme === 'light') return 'weiss';
    const w = Daten.get('lokal:bib-hintergrund', null);
    return w === 'dunkelgrau' || w === 'dunkelblau' ? w : 'dunkelblau';
  };
  function setzeBibHg() { wurzel.dataset.bibHg = bibHg(); }
  setzeThema(Daten.get('lokal:thema', 'dark'));
  $('thema-knopf').addEventListener('click', () => {
    const neu = wurzel.dataset.theme === 'light' ? 'dark' : 'light';
    Daten.set('lokal:thema', neu);
    setzeThema(neu);
  });

  const anzahl = (n, eins, viele) => `${n} ${n === 1 ? eins : viele}`;

  // Tooltip für Kalender und Balken
  const tooltip = $('tooltip');
  document.addEventListener('pointerover', e => {
    const z = e.target.closest && e.target.closest('[data-tipp]');
    if (!z) { tooltip.hidden = true; return; }
    tooltip.textContent = z.dataset.tipp;
    tooltip.hidden = false;
    const r = z.getBoundingClientRect();
    const b = tooltip.offsetWidth;
    tooltip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - b / 2, window.innerWidth - b - 8)) + 'px';
    tooltip.style.top = (r.top - tooltip.offsetHeight - 8) + 'px';
  });
  window.addEventListener('scroll', () => { tooltip.hidden = true; }, { passive: true });

  /* ---------- Menü ---------- */

  const knopf = $('menue-knopf'), liste = $('menue-liste');
  function menue(auf) { liste.hidden = !auf; knopf.setAttribute('aria-expanded', String(auf)); }
  knopf.addEventListener('click', e => { e.stopPropagation(); menue(liste.hidden); });
  document.addEventListener('click', e => { if (!liste.hidden && !liste.contains(e.target)) menue(false); });
  liste.addEventListener('click', e => { if (e.target.closest('a, button')) menue(false); });

  /* ---------- Einstellungen ---------- */

  const wendeZeitAn = () => wurzel.classList.toggle('zeit-aus', !Zeit.sichtbar());
  wendeZeitAn();
  Daten.on(({ key }) => { if (key === 'lokal:lernzeit') wendeZeitAn(); });

  $('menue-einstellungen').addEventListener('click', async () => {
    const stift = Werkzeuge.einstellungen();
    const r = await UI.oeffneDialog(`<form class="dialog-form">
        <h2>Einstellungen</h2>
        <label class="haken-label"><input type="checkbox" name="zeit" ${Zeit.sichtbar() ? 'checked' : ''}> Lernzeit anzeigen</label>
        <p class="dialog-klein">Zeigt die Lernzeit in der Bibliothek und beim Schreiben. Gezählt wird im Hintergrund trotzdem, damit nichts fehlt, wenn du sie später einschaltest.</p>
        <label class="haken-label"><input type="checkbox" name="finger" ${stift.finger ? 'checked' : ''}> Mit dem Finger schreiben</label>
        <p class="dialog-klein">Ein Finger schreibt mit dem gewählten Werkzeug, z. B. mit dem Textmarker. Zwei Finger verschieben und zoomen. Mit der Hand (Taste H) verschiebst du auch mit einem Finger oder dem Stift. Auch in der Werkzeugleiste umschaltbar.</p>
        <label class="feld"><span>Glättung der Handschrift</span>
          <select name="glaettung">${[['aus', 'Aus'], ['niedrig', 'Niedrig'], ['mittel', 'Mittel'], ['hoch', 'Hoch']].map(([w, n]) => `<option value="${w}" ${stift.glaettung === w ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </label>
        <p class="dialog-klein">Gegen zittrige Linien, besonders in Kurven und beim Kritzeln. Höher heisst ruhiger, aber die Linie folgt dem Stift etwas später.</p>
        <label class="haken-label"><input type="checkbox" name="halte" ${stift.halteForm !== false ? 'checked' : ''}> Halten macht Linien gerade und Formen sauber</label>
        <p class="dialog-klein">Am Ende eines Strichs den Stift ruhig halten: daraus wird eine gerade Linie, ein Pfeil (Schaft, dann zwei Widerhaken in einem Zug) oder, bei einer geschlossenen Zeichnung, ein Dreieck, Viereck, Rechteck, Vieleck, Kreis oder eine Ellipse aus deinen Punkten. Rückgängig bringt die Zeichnung zurück.</p>
        <label class="feld"><span>Haltezeit: <output name="halteAnzeige">${((stift.halteMs || 700) / 1000).toFixed(2).replace('.', ',')} s</output></span>
          <input type="range" name="halteMs" min="400" max="1500" step="50" value="${stift.halteMs || 700}">
        </label>
        <p class="dialog-klein">So lange den Stift am Ende ruhig halten, bis die Form einrastet. Länger heisst weniger versehentliches Einrasten.</p>
        <label class="haken-label"><input type="checkbox" name="kritzel" ${stift.kritzelLoeschen !== false ? 'checked' : ''}> Überkritzeln löscht Geschriebenes</label>
        <p class="dialog-klein">Mit einem Zickzack über Geschriebenes wird es gelöscht (Rückgängig holt es zurück). Ohne Geschriebenes darunter bleibt das Gekritzel stehen.</p>
        <fieldset class="wahl-reihe"><legend>Farben (Startseite, Kopfleiste und Dokumente)</legend>
          <div class="hg-wahl">${Object.entries(BIB_HG).map(([w, n]) => `<label><input type="radio" name="hg" value="${w}" ${bibHg() === w ? 'checked' : ''}><span class="muster" style="--c: ${BIB_HG_FARBE[w]}"></span>${n}</label>`).join('')}</div>
        </fieldset>
        <label class="feld"><span>Entwickler: Trennlinie bei zwei Dokumenten</span>
          <select name="splitv">${Dokument.splitVarianten().map(([k, n]) => `<option value="${k}" ${Dokument.splitVariante() === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        </label>
        <label class="haken-label"><input type="checkbox" name="splitdebug" ${Dokument.splitDebug() ? 'checked' : ''}> FPS und Layout-Zeit beim Ziehen anzeigen</label>
        ${B ? `<p class="einst-ort"><span>Speicherort</span><span class="pfad-text">${esc((B.ort && B.ort.info() ? B.ort.info().daten : B.wurzel) || '')}</span><button type="button" class="btn-leise klein" data-wahl="speicherort">Ändern …</button></p>
        <p class="dialog-klein">Hier liegen Bibliothek und Daten, auf Wunsch in einem Cloud-Ordner, um auf einem anderen Computer weiterzuarbeiten.</p>` : ''}
        ${UI.knoepfe('Speichern')}
      </form>`, {
      init: d => {
        const regler = d.querySelector('[name="halteMs"]'), anzeige = d.querySelector('[name="halteAnzeige"]');
        regler.addEventListener('input', () => { anzeige.textContent = (regler.value / 1000).toFixed(2).replace('.', ',') + ' s'; });
      },
      wert: d => ({
        zeit: d.querySelector('[name="zeit"]').checked, finger: d.querySelector('[name="finger"]').checked,
        glaettung: d.querySelector('[name="glaettung"]').value, halte: d.querySelector('[name="halte"]').checked,
        halteMs: Number(d.querySelector('[name="halteMs"]').value) || 700,
        splitv: d.querySelector('[name="splitv"]').value, splitdebug: d.querySelector('[name="splitdebug"]').checked,
        kritzel: d.querySelector('[name="kritzel"]').checked, hg: d.querySelector('[name="hg"]:checked').value
      })
    });
    if (r === 'speicherort') { zeigeSpeicherort(); return; }
    if (!r) return;
    Daten.set('lokal:lernzeit', r.zeit);
    // Hell schaltet das helle Design ein, Dunkelgrau und Dunkelblau das dunkle in dieser Farbe
    if (r.hg === 'weiss') { Daten.set('lokal:thema', 'light'); setzeThema('light'); }
    else { Daten.set('lokal:bib-hintergrund', r.hg); Daten.set('lokal:thema', 'dark'); setzeThema('dark'); }
    stift.finger = r.finger;
    stift.glaettung = r.glaettung;
    stift.halteForm = r.halte;
    stift.halteMs = r.halteMs;
    Dokument.splitVariante(r.splitv);
    Dokument.splitDebug(r.splitdebug);
    stift.kritzelLoeschen = r.kritzel;
    Werkzeuge.speichereEinst();
    wendeZeitAn();
    route();
  });

  function menueOrdner() {
    $('menue-ordner').innerHTML = Bibliothek.kinderOrdner(null).map(o =>
      `<a href="#/bibliothek/${o.id}" data-bereich="ordner-${o.id}">${Bibliothek.ordnerSymbol(o.farbe)}${esc(o.name)}</a>`).join('');
  }

  /* ---------- Speicherort ---------- */

  // Speicherort (Ordner für Bibliothek und Daten, auch in einer Cloud) und Sicherung in einer einzigen Datei
  const kannOrt = !!(B && B.ort && B.sicherung);
  async function zeigeSpeicherort() {
    if (!B) { zeigeWebSicherung(); return; }
    // iPad-App: OneDrive oder Dropbox statt eines Ordners
    if (B.wolke) { B.wolke.zeigeDialog(); return; }
    if (!kannOrt) { UI.meldung('Bitte das Lernheft neu starten, damit der Speicherort einstellbar wird.'); return; }
    const ort = B.ort.info() || { daten: B.wurzel, eigener: false };
    const info = await B.sicherung.info().catch(() => null);
    const wahl = await UI.oeffneDialog(`<div class="dialog-form">
        <h2>Speicherort und Sicherung</h2>
        <p class="dialog-klein">${ort.eigener ? 'Bibliothek und Daten liegen in diesem Ordner:' : 'Bibliothek und Daten liegen im Ordner beim Programm:'}</p>
        <p class="pfad-text">${esc(ort.daten)}</p>
        <p class="dialog-klein">Wähle einen Ordner in OneDrive, Google Drive, Dropbox oder iCloud, dann hast du alles auch auf einem anderen Computer: dort wählst du denselben Ordner (sein Pfad darf anders lauten). Der Pfad wird nur auf diesem Gerät gemerkt, nicht im Ordner selbst.</p>
        <dl class="sync-liste">
          <dt>Handschrift</dt><dd>Jede Seite liegt als kleine Datei (Vektoren, komprimiert) im Ordner „Handschrift“ ihres Dokuments. Nur was sich ändert, lädt die Cloud hoch. ${info ? `Jetzt: ${info.dateien} ${info.dateien === 1 ? 'Datei' : 'Dateien'}, zusammen ${UI.groesseText(info.bytes)}.` : ''}</dd>
          <dt>Abgleich</dt><dd>Legt die Cloud bei einem Konflikt eine zweite Kopie an, werden beide Stände zusammengeführt, nichts geht verloren. Änderungen von aussen werden übernommen, ohne dass du etwas verlierst.${info && info.zusammengefuehrt ? ` Zusammengeführt seit dem Start: ${info.zusammengefuehrt}.` : ''}</dd>
        </dl>
        <div class="ort-aktionen">
          <button type="button" class="btn-primaer" data-wahl="ort">Speicherort ändern …</button>
          ${ort.eigener ? '<button type="button" class="btn-leise" data-wahl="standard">Zurück zum Ordner beim Programm</button>' : ''}
          <button type="button" class="btn-leise" data-wahl="wurzel">Ordner im Explorer öffnen</button>
          <button type="button" class="btn-leise" data-wahl="export">Alles in einer Datei sichern …</button>
          <button type="button" class="btn-leise" data-wahl="import">Sicherung importieren …</button>
        </div>
        <p class="dialog-klein">Die Sicherung ist eine einzelne Datei mit allen Notizen und Einstellungen, ohne die PDFs. Beim Importieren wird sie mit dem Vorhandenen zusammengeführt.</p>
        <div class="dialog-knoepfe"><button type="button" class="btn-leise" data-abbrechen>Schliessen</button></div>
      </div>`);
    if (!wahl) return;
    const fehler = r => { if (r && r.fehler) UI.meldung(r.fehler); return r && r.fehler; };
    if (wahl === 'wurzel') B.oeffneOrdner('wurzel');
    else if (wahl === 'ort') fehler(await B.ort.waehlen());
    else if (wahl === 'standard') fehler(await B.ort.standard());
    else if (wahl === 'export') {
      const r = await B.sicherung.exportieren();
      if (!fehler(r) && r && r.ok) UI.meldung(`Gesichert: ${UI.groesseText(r.bytes)} in einer Datei`);
    } else if (wahl === 'import') {
      const r = await B.sicherung.importieren();
      if (!fehler(r) && r && r.ok) UI.meldung(`Zusammengeführt: ${anzahl(r.bericht.dokumente, 'Dokument', 'Dokumente')}, ${anzahl(r.bericht.seiten, 'Seite', 'Seiten')}`);
    }
  }
  // Web-App (iPad, Browser): alles liegt im Speicher des Browsers; Sicherung in einer Datei als Absicherung
  async function zeigeWebSicherung() {
    let belegt = '';
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); belegt = `Belegt: ${UI.groesseText(e.usage || 0)} von ${UI.groesseText(e.quota || 0)}.`; } } catch (e) { /* ohne Angabe */ }
    const wahl = await UI.oeffneDialog(`<div class="dialog-form">
        <h2>Speicher und Sicherung</h2>
        <p class="dialog-klein">In der Web-App liegen alle Notizen im Speicher dieses Browsers. ${esc(belegt)} Safari kann ihn bei Platzmangel oder nach längerer Pause löschen, wenn die App nicht auf dem Home-Bildschirm liegt. Sichere deshalb regelmässig in eine Datei (sie landet in der Dateien-App).</p>
        <div class="ort-aktionen">
          <button type="button" class="btn-primaer" data-wahl="export">Alles in einer Datei sichern …</button>
          <button type="button" class="btn-leise" data-wahl="import">Sicherung importieren …</button>
        </div>
        <input id="web-import" type="file" accept=".gz,.json,application/json,application/gzip" hidden>
        <p class="dialog-klein">Beim Importieren wird mit dem Vorhandenen zusammengeführt, nichts wird überschrieben. Die Datei enthält auch die PDFs.</p>
        <div class="dialog-knoepfe"><button type="button" class="btn-leise" data-abbrechen>Schliessen</button></div>
      </div>`);
    if (wahl === 'export') {
      try { const r = await WebSicherung.exportieren(); UI.meldung(`Gesichert: ${anzahl(r.dokumente, 'Dokument', 'Dokumente')}, ${UI.groesseText(r.bytes)}`); } catch (e) { UI.meldung(e.message || 'Die Sicherung hat nicht geklappt.'); }
    } else if (wahl === 'import') {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.gz,.json,application/json,application/gzip';
      inp.onchange = async () => {
        if (!inp.files[0]) return;
        try { const r = await WebSicherung.importieren(inp.files[0]); UI.meldung(`Zusammengeführt: ${r.neu} neu, ${r.zusammengefuehrt} Seiten vereint, ${r.dateien} PDFs`); } catch (e) { UI.meldung(e.message || 'Der Import hat nicht geklappt.'); }
      };
      inp.click();
    }
  }
  const ortKnopf = $('sync-status');
  ortKnopf.querySelector('span').textContent = B ? (B.wolke ? B.wolke.name || 'OneDrive' : 'Speicherort') : 'Speicher und Sicherung';
  ortKnopf.addEventListener('click', zeigeSpeicherort);

  /* ---------- Navigation ---------- */

  const ANSICHTEN = ['bibliothek', 'dok'];
  let bereich = null;

  // Die Bibliothek ist die einzige Startansicht; alles Unbekannte (auch die frühere Startseite) führt dorthin
  function route() {
    let [teil, id] = location.hash.replace(/^#\/?/, '').split('/');
    if (teil === 'skripte') teil = 'bibliothek';
    if (teil === 'pdf') teil = 'dok';
    // Ein Skript oder Notizbuch in einem eigenen Fenster (ohne Kopfzeile und Tabs)
    if (teil === 'fenster') { Dokument.alsFenster(); teil = 'dok'; }
    const neu = ANSICHTEN.includes(teil) ? teil : 'bibliothek';
    if (neu !== teil) id = null;
    const wechsel = neu !== bereich;
    bereich = neu;
    menue(false);

    if (neu !== 'dok') Dokument.verstecke();
    for (const a of ANSICHTEN) $('ansicht-' + a).hidden = a !== neu;
    wurzel.dataset.bereich = neu;
    Zeit.setzeBereich(neu === 'dok' ? 'dok:' + id : 'sonst');

    if (neu === 'bibliothek') {
      Bibliothek.zeigeOrdner(id || null);
      const p = Bibliothek.pfadVon(id);
      document.title = (p.length ? p[p.length - 1].name + ' · ' : '') + 'Bibliothek · Lernheft';
    } else Dokument.oeffne(id);

    const aktivKey = neu === 'bibliothek' && id ? 'ordner-' + ((Bibliothek.pfadVon(id)[0] || {}).id) : 'bibliothek';
    liste.querySelectorAll('a').forEach(a => {
      if (a.dataset.bereich === aktivKey || (neu === 'bibliothek' && a.dataset.bereich === 'bibliothek')) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (wechsel && neu !== 'dok') window.scrollTo(0, 0);
  }

  // Tastatur: an die offene Schreibfläche weiterleiten
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea') || UI.dialogOffen()) return;
    if (!liste.hidden && e.key === 'Escape') { menue(false); knopf.focus(); return; }
    if (bereich === 'dok' && Dokument.aktiv()) Dokument.taste(e);
  });

  document.addEventListener('bibliothek:geaendert', menueOrdner);

  window.addEventListener('hashchange', route);
  menueOrdner();
  route();
  wurzel.classList.add('bereit');
});
