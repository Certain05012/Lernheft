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

  // Einstellungen in Bereichen (links wählen, rechts einstellen). Jede Änderung gilt sofort, es gibt kein "Speichern":
  // so sieht man gleich, was sie bewirkt, und nichts geht beim Schliessen verloren. Was am Stift des Geräts hängt
  // (Druckkurve, Tasten, Diagnose), bleibt im Stift-Panel der Werkzeugleiste; von hier führt ein Knopf dorthin.
  const EINST_REITER = [
    ['schreiben', 'Schreiben', '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>'],
    ['gesten', 'Gesten', '<path d="M10 12V4.5a1.5 1.5 0 013 0V11"/><path d="M13 10.5a1.5 1.5 0 013 0V12"/><path d="M16 11.5a1.5 1.5 0 013 0V15c0 3.4-2.4 6-5.8 6H12c-2 0-3.3-.9-4.4-2.4L5.3 15.4a1.5 1.5 0 012.4-1.8l2.3 2.6"/>'],
    ['aussehen', 'Aussehen', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'],
    ['speicher', 'Speicher', '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>'],
    ['erweitert', 'Erweitert', '<path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h12M20 17h0"/><circle cx="16" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="18" cy="17" r="2"/>']
  ];
  const GLAETTUNG_NAMEN = [['aus', 'Aus'], ['niedrig', 'Niedrig'], ['mittel', 'Mittel'], ['hoch', 'Hoch']];
  async function zeigeEinstellungen(reiter) {
    const stift = Werkzeuge.einstellungen();
    const start = EINST_REITER.some(r => r[0] === reiter) ? reiter : Daten.get('lokal:einst-reiter', 'schreiben');
    const gesten = () => Object.assign({}, Leinwand.GESTEN_STANDARD, stift.gesten || {});
    const schalter = (name, an, titel, hinweis) => `<label class="einst-zeile"><span class="einst-text"><b>${titel}</b>${hinweis ? `<small>${hinweis}</small>` : ''}</span><input type="checkbox" class="schalter" name="${name}" ${an ? 'checked' : ''}></label>`;
    const wahl = (name, werte, jetzt, titel, hinweis, symbole) => `<div class="einst-zeile hoch"><span class="einst-text"><b>${titel}</b>${hinweis ? `<small>${hinweis}</small>` : ''}</span>
        <span class="segmente" role="radiogroup" aria-label="${esc(titel)}">${werte.map(([w, n]) => `<label><input type="radio" name="${name}" value="${w}" ${jetzt === w ? 'checked' : ''}><span>${symbole ? `<svg viewBox="0 0 24 24" aria-hidden="true">${symbole[w] || ''}</svg>` : ''}${esc(n)}</span></label>`).join('')}</span></div>`;
    const stiftSymbole = { fueller: '<path d="M12 21l-5-9 3-8h4l3 8z"/><path d="M12 21v-7"/><circle cx="12" cy="12.6" r="1.3"/>', kugel: '<path d="M9 3h6v10l-2 5h-2l-2-5z"/><path d="M9 7h6"/><path d="M12 18v3"/>', pinsel: '<path d="M10 3h4v7c0 1.6 2 2.6 2 5.2 0 3.2-2.2 5.8-4 5.8s-4-2.6-4-5.8c0-2.6 2-3.6 2-5.2z"/><path d="M10 7h4"/>' };
    const gestenZeile = ([k, t]) => `<label class="einst-zeile"><span class="einst-text"><b>${esc(t.replace(/ \(.*\)$/, ''))}</b></span><select name="geste" data-geste="${k}">${Object.entries(Leinwand.GESTEN_AKTIONEN).map(([w, n]) => `<option value="${w}" ${gesten()[k] === w ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    const fingerGesten = Werkzeuge.GESTEN_LISTE.filter(([k]) => !k.startsWith('pencil')), pencilGesten = Werkzeuge.GESTEN_LISTE.filter(([k]) => k.startsWith('pencil'));
    const ortText = B ? (B.wolke ? `Abgleich mit ${esc(B.wolke.name || 'der Cloud')}` : esc((B.ort && B.ort.info() ? B.ort.info().daten : B.wurzel) || '')) : 'Im Speicher dieses Browsers';
    const stiftArt = Leinwand.STIFTARTEN[stift.stiftArt] ? stift.stiftArt : 'fueller';
    await UI.oeffneDialog(`<div class="dialog-form einst">
        <header class="einst-kopf"><h2>Einstellungen</h2><button type="button" class="rund-knopf" data-abbrechen aria-label="Schliessen" title="Schliessen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button></header>
        <div class="einst-koerper">
          <nav class="einst-nav" role="tablist" aria-label="Bereiche">
            ${EINST_REITER.map(([k, n, sym]) => `<button type="button" role="tab" data-reiter="${k}" aria-selected="${k === start}"><svg viewBox="0 0 24 24" aria-hidden="true">${sym}</svg><span>${n}</span></button>`).join('')}
          </nav>
          <div class="einst-seiten">
            <section data-seite="schreiben" ${start === 'schreiben' ? '' : 'hidden'}>
              <h3>Stift</h3>
              <div class="einst-gruppe">
                ${wahl('stiftArt', Object.entries(Leinwand.STIFTARTEN), stiftArt, 'Stiftart', '<span data-info="stiftArt">' + esc(Werkzeuge.STIFTART_TITEL[stiftArt]) + '</span>', stiftSymbole)}
                ${wahl('glaettung', GLAETTUNG_NAMEN, stift.glaettung, 'Glättung', 'Nimmt das Zittern aus der Linie. Höher ist ruhiger, die Linie folgt dem Stift dann etwas später.')}
                ${schalter('schwebeVorschau', stift.schwebeVorschau !== false, 'Vorschau beim Schweben', 'Hält man den Apple Pencil knapp über das Blatt, zeigt ein Punkt, wo und wie breit der Strich ansetzt.')}
                ${schalter('finger', !!stift.finger, 'Mit dem Finger schreiben', 'Ein Finger schreibt, zwei Finger verschieben und zoomen. Aus: Finger verschieben, nur der Stift schreibt.')}
              </div>
              <h3>Schlaue Tinte</h3>
              <div class="einst-gruppe">
                ${schalter('halteForm', stift.halteForm !== false, 'Halten macht Formen', 'Am Ende eines Strichs ruhig halten: gerade Linie, Pfeil, Dreieck, Rechteck, Vieleck, Kreis oder Ellipse. Weiter ziehen passt die Form an.')}
                <label class="einst-zeile" data-nur="halteForm"><span class="einst-text"><b>Haltezeit</b><small>So lange ruhig halten, bis die Form einrastet.</small></span><span class="einst-regler"><input type="range" name="halteMs" min="400" max="1500" step="50" value="${stift.halteMs || 700}"><output name="halteAnzeige"></output></span></label>
                ${schalter('kritzelLoeschen', stift.kritzelLoeschen !== false, 'Überkritzeln löscht', 'Mit einem Zickzack über Geschriebenes fahren löscht es. Rückgängig holt es zurück.')}
                ${schalter('kreisAuswahl', stift.kreisAuswahl !== false, 'Einkreisen und antippen wählt aus', 'Etwas mit dem Stift einkreisen und dann auf die Kreislinie tippen: es ist ausgewählt und lässt sich verschieben, ohne zum Lasso zu wechseln.')}
              </div>
              <h3>Stift dieses Geräts</h3>
              <div class="einst-gruppe">
                ${schalter('federDrehung', stift.federDrehung !== false, 'Feder dreht sich mit (Apple Pencil Pro)', 'Füller: die Feder ist breit und folgt der Drehung des Stifts, wie eine echte Feder. Wirkt nur mit Stiften, die ihre Drehung melden.')}
                <div class="einst-zeile"><span class="einst-text"><b>Druck, Neigung, Tasten</b><small>Druckkurve, Seitentaste und Prüffeld für den Stift an diesem Gerät.</small></span><button type="button" class="btn-leise klein" data-tu="stiftpanel">Stift einstellen …</button></div>
              </div>
            </section>
            <section data-seite="gesten" ${start === 'gesten' ? '' : 'hidden'}>
              <h3>Finger</h3>
              <p class="einst-hinweis">Tippen heisst: kurz auf die Schreibfläche und wieder weg, ohne zu wischen.</p>
              <div class="einst-gruppe">${fingerGesten.map(gestenZeile).join('')}</div>
              <h3>Apple Pencil</h3>
              <p class="einst-hinweis">Doppelt tippen und Zusammendrücken meldet das iPad nur an die iPad-App, nicht an Safari und die Web-App.</p>
              <div class="einst-gruppe">${pencilGesten.map(gestenZeile).join('')}</div>
              <div class="einst-knoepfe"><button type="button" class="btn-leise klein" data-tu="gesten-null">Gesten zurücksetzen</button></div>
            </section>
            <section data-seite="aussehen" ${start === 'aussehen' ? '' : 'hidden'}>
              <h3>Farben</h3>
              <div class="einst-gruppe">
                <div class="einst-zeile hoch"><span class="einst-text"><b>Design</b><small>Gilt für Startseite, Kopfleiste und Dokumente.</small></span>
                  <span class="hg-wahl">${Object.entries(BIB_HG).map(([w, n]) => `<label><input type="radio" name="hg" value="${w}" ${bibHg() === w ? 'checked' : ''}><span class="muster" style="--c: ${BIB_HG_FARBE[w]}"></span>${n}</label>`).join('')}</span></div>
              </div>
              <h3>Werkzeugleiste</h3>
              <div class="einst-gruppe">
                ${schalter('farbig', Daten.get('lokal:leiste-farbig', true) !== false, 'Farbige Symbole', 'Gestaltete Werkzeuge statt einfacher Linien.')}
                <div class="einst-zeile"><span class="einst-text"><b>Symbole auswählen</b><small>Was du nicht brauchst, ausblenden. Die Reihenfolge änderst du direkt in der Leiste durch Ziehen.</small></span><button type="button" class="btn-leise klein" data-tu="leiste">Anpassen …</button></div>
              </div>
              <h3>Anzeige</h3>
              <div class="einst-gruppe">
                ${schalter('zeit', Zeit.sichtbar(), 'Lernzeit anzeigen', 'In der Bibliothek und beim Schreiben. Gezählt wird auch, wenn sie ausgeblendet ist.')}
              </div>
            </section>
            <section data-seite="speicher" ${start === 'speicher' ? '' : 'hidden'}>
              <h3>Speicherort</h3>
              <div class="einst-gruppe">
                <div class="einst-zeile"><span class="einst-text"><b>${B && B.wolke ? 'Cloud' : 'Bibliothek und Daten'}</b><small class="pfad-text">${ortText}</small></span><button type="button" class="btn-leise klein" data-tu="speicherort">${B ? 'Öffnen …' : 'Sichern …'}</button></div>
              </div>
              <p class="einst-hinweis">Gespeichert wird von selbst, kurz nach jedem Strich. ${B && !B.wolke ? 'Liegt der Ordner in OneDrive, Dropbox, Google Drive oder iCloud, hast du alles auch auf anderen Geräten.' : ''}</p>
            </section>
            <section data-seite="erweitert" ${start === 'erweitert' ? '' : 'hidden'}>
              <h3>Zwei Dokumente nebeneinander</h3>
              <div class="einst-gruppe">
                <label class="einst-zeile"><span class="einst-text"><b>Trennlinie ziehen</b><small>Wie das Bild beim Ziehen der Trennlinie folgt.</small></span><select name="splitv">${Dokument.splitVarianten().map(([k, n]) => `<option value="${k}" ${Dokument.splitVariante() === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
                ${schalter('splitdebug', Dokument.splitDebug(), 'Bildrate beim Ziehen anzeigen', 'Für die Fehlersuche: FPS und Layout-Zeit.')}
              </div>
              <p class="einst-hinweis">${esc(window.LHVersion ? 'Lernheft ' + window.LHVersion : 'Lernheft')}</p>
            </section>
          </div>
        </div>
      </div>`, {
      klasse: 'einst-dialog',
      init: (d, fertig) => {
        const nenne = n => d.querySelector(`[name="${n}"]`);
        const zeigeReiter = k => {
          d.querySelectorAll('.einst-nav [data-reiter]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.reiter === k)));
          d.querySelectorAll('[data-seite]').forEach(x => { x.hidden = x.dataset.seite !== k; });
          d.querySelector('.einst-seiten').scrollTop = 0;
          Daten.set('lokal:einst-reiter', k);
        };
        d.querySelector('.einst-nav').addEventListener('click', ev => { const b = ev.target.closest('[data-reiter]'); if (b) zeigeReiter(b.dataset.reiter); });
        const halte = () => {
          nenne('halteAnzeige').textContent = (nenne('halteMs').value / 1000).toFixed(2).replace('.', ',') + ' s';
          d.querySelector('[data-nur="halteForm"]').classList.toggle('aus', !nenne('halteForm').checked);
          nenne('halteMs').disabled = !nenne('halteForm').checked;
        };
        halte();
        nenne('halteMs').addEventListener('input', halte);
        // Jede Änderung gilt sofort
        d.addEventListener('change', ev => {
          const k = ev.target, n = k.name;
          if (!n) return;
          if (n === 'geste') stift.gesten = Object.assign({}, stift.gesten || {}, { [k.dataset.geste]: k.value });
          else if (n === 'stiftArt') { stift.stiftArt = k.value; d.querySelector('[data-info="stiftArt"]').textContent = Werkzeuge.STIFTART_TITEL[k.value] || ''; }
          else if (n === 'glaettung') stift.glaettung = k.value;
          else if (n === 'halteMs') stift.halteMs = Number(k.value) || 700;
          else if (['schwebeVorschau', 'finger', 'halteForm', 'kritzelLoeschen', 'kreisAuswahl', 'federDrehung'].includes(n)) stift[n] = k.checked;
          else if (n === 'zeit') { Daten.set('lokal:lernzeit', k.checked); wendeZeitAn(); return; }
          else if (n === 'farbig') { Daten.set('lokal:leiste-farbig', k.checked); Werkzeuge.speichereEinst(); document.querySelectorAll('.werkzeugleiste').forEach(l => l.classList.toggle('farbig', k.checked)); return; }
          else if (n === 'hg') {
            // Hell schaltet das helle Design ein, Dunkelgrau und Dunkelblau das dunkle in dieser Farbe
            if (k.value === 'weiss') { Daten.set('lokal:thema', 'light'); setzeThema('light'); }
            else { Daten.set('lokal:bib-hintergrund', k.value); Daten.set('lokal:thema', 'dark'); setzeThema('dark'); }
            return;
          }
          else if (n === 'splitv') { Dokument.splitVariante(k.value); return; }
          else if (n === 'splitdebug') { Dokument.splitDebug(k.checked); return; }
          else return;
          halte();
          Werkzeuge.speichereEinst();
        });
        d.addEventListener('click', ev => {
          const k = ev.target.closest('[data-tu]');
          if (!k) return;
          const tu = k.dataset.tu;
          if (tu === 'gesten-null') {
            stift.gesten = {};
            Werkzeuge.speichereEinst();
            d.querySelectorAll('[data-geste]').forEach(sel => { sel.value = Leinwand.GESTEN_STANDARD[sel.dataset.geste]; });
            UI.meldung('Gesten zurückgesetzt');
            return;
          }
          fertig(null);
          if (tu === 'speicherort') zeigeSpeicherort();
          else if (tu === 'leiste') { if (Dokument.aktiv()) Werkzeuge.anpassen(); else UI.meldung('Öffne ein Dokument: dort lässt sich die Werkzeugleiste anpassen (Menü ⋯).'); }
          else if (tu === 'stiftpanel') { if (!Dokument.stiftPanel()) UI.meldung('Öffne ein Dokument: das Stift-Panel gehört zur Werkzeugleiste.'); }
        });
      }
    });
    route();
  }
  window.Einstellungen = { zeige: zeigeEinstellungen };
  $('menue-einstellungen').addEventListener('click', () => zeigeEinstellungen());

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
