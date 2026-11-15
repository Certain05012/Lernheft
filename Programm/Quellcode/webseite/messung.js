'use strict';
// Flüssigkeit messen (Einstellungen › Erweitert): während man ganz normal scrollt und schreibt, wird aufgezeichnet,
//   - wie lang jedes Bild dauert (Abstand zwischen zwei requestAnimationFrame): Ruckler sind lange Bilder,
//   - wie oft und wie lange der Ablauf der Seite blockiert ist (ein Zeitgeber alle 4 ms, der zu spät kommt): das zeigt
//     eigene Arbeit, die zu lange dauert (Speichern, Abgleich, Malen), egal woher sie kommt,
//   - wie lange die Schreibfläche selbst je Bild rechnet (frame) und wie lange die Zeiger-Ereignisse brauchen.
// Sind die Bilder lang, der Ablauf aber nicht blockiert, liegt es am Malen und Zusammensetzen im Browser (Zeichenflächen),
// sonst an eigener Arbeit. Das Ergebnis ist ein kurzer Text zum Kopieren: so lässt sich auf dem eigenen Gerät (iPad,
// Safari) prüfen, was sich von aussen nicht messen lässt.
(function () {
  const M = {};
  let lauf = null;
  M.laeuft = () => !!lauf;
  // Von der Schreibfläche: so lange hat frame() gerechnet
  M.frame = ms => { if (lauf) lauf.eigen.push(ms); };
  const zahl = (v, n = 1) => String(Math.round(v * Math.pow(10, n)) / Math.pow(10, n)).replace('.', ',');
  const sortiert = a => a.slice().sort((x, y) => x - y);
  const mittel = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  function werte(l, sekunden) {
    const bild = l.bild.slice(2), s = sortiert(bild), median = s.length ? s[Math.floor(s.length / 2)] : 0;
    const eigen = sortiert(l.eigen), zeiger = sortiert(l.zeigerMs);
    const lw = window.Dokument && Dokument.leinwand && Dokument.leinwand();
    const st1 = lw && lw.statistik ? lw.statistik() : null, st0 = l.stat;
    const diff = k => (st0 && st1 ? (st1[k] || 0) - (st0[k] || 0) : null);
    const e = {
      version: window.LHVersion || '', sekunden,
      bilder: bild.length, jeSekunde: bild.length / sekunden, ueblich: median, laengstes: s.length ? s[s.length - 1] : 0,
      // Ruckler: Bilder, die mindestens anderthalbmal so lang sind wie üblich (bei 60 Hz ab 25 ms, bei 120 Hz ab 12,5 ms)
      ruckler: bild.filter(x => x > Math.max(12, median * 1.5)).length, ueber50: bild.filter(x => x > 50).length, ueber100: bild.filter(x => x > 100).length,
      blockAnzahl: l.block.length, blockLaengste: l.block.reduce((m, x) => Math.max(m, x[1]), 0), blockSumme: l.block.reduce((m, x) => m + x[1], 0),
      blockListe: l.block.slice().sort((x, y) => y[1] - x[1]).slice(0, 5).map(x => `${zahl(x[1], 0)} ms bei ${zahl(x[0] / 1000)} s`),
      eigenMittel: mittel(eigen), eigenLaengste: eigen.length ? eigen[eigen.length - 1] : 0, eigenUeber8: eigen.filter(x => x > 8).length, eigenBilder: eigen.length,
      zeiger: l.zeiger, zeigerMittel: mittel(zeiger), zeigerLaengste: zeiger.length ? zeiger[zeiger.length - 1] : 0,
      voll: diff('voll'), kacheln: diff('kacheln'), bereiche: diff('bereich'),
      kachelStand: lw && lw.kacheln ? lw.kacheln() : null
    };
    const it = window.Dokument && Dokument.id && window.Bibliothek ? Bibliothek.get(Dokument.id()) : null;
    const seite = lw ? lw.seiten()[lw.aktuelleSeite()] : null;
    const zeilen = [
      `Lernheft ${e.version || '?'} · Messung über ${sekunden} s`,
      `Gerät: ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 110)}`,
      `Bild ${innerWidth}×${innerHeight} · Pixel je Punkt ${zahl(window.devicePixelRatio || 1, 2)} · ${navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches) ? 'vom Home-Bildschirm' : 'im Browser'}${window.Capacitor ? ' · iPad-App' : ''}`,
      it ? `Dokument: ${it.art === 'skript' ? 'Skript' : it.papier === 'whiteboard' ? 'Whiteboard' : 'Notizbuch'}, ${lw.seiten().length} Seiten, auf dieser Seite ${seite ? lw.inhalt(seite.id).e.length : 0} Elemente, Zoom ${zahl(lw.ansicht().s * 100, 0)} %` : 'Kein Dokument offen',
      `Bilder: ${e.bilder} (${zahl(e.jeSekunde, 0)} je s) · üblich ${zahl(e.ueblich)} ms · längstes ${zahl(e.laengstes, 0)} ms`,
      `Ruckler (Bild viel länger als üblich): ${e.ruckler} · über 50 ms: ${e.ueber50} · über 100 ms: ${e.ueber100}`,
      `Ablauf blockiert (über 20 ms): ${e.blockAnzahl} mal · längste ${zahl(e.blockLaengste, 0)} ms · zusammen ${zahl(e.blockSumme, 0)} ms`,
      e.blockListe.length ? `  längste: ${e.blockListe.join(' · ')}` : '',
      `Schreibfläche je Bild: Mittel ${zahl(e.eigenMittel, 2)} ms · längste ${zahl(e.eigenLaengste)} ms · über 8 ms: ${e.eigenUeber8} von ${e.eigenBilder}`,
      `Zeiger-Ereignisse: ${e.zeiger} (${zahl(e.zeiger / sekunden, 0)} je s) · Mittel ${zahl(e.zeigerMittel, 2)} ms · längstes ${zahl(e.zeigerLaengste)} ms`,
      e.voll == null ? '' : `Neu gemalt: alles ${e.voll} mal · Kacheln ${e.kacheln} · Teilbereiche ${e.bereiche}${e.kachelStand ? ` · Kacheln im Speicher ${e.kachelStand.anzahl} (${e.kachelStand.mb} MB)` : ''}`
    ].filter(Boolean);
    e.text = zeilen.join('\n');
    return e;
  }

  // Zeichnet "sekunden" lang auf und liefert das Ergebnis (mit .text zum Kopieren). Währenddessen steht oben ein kleiner Hinweis.
  M.starte = (sekunden = 20) => new Promise(ok => {
    if (lauf) { ok(null); return; }
    const t0 = performance.now();
    const lw = window.Dokument && Dokument.leinwand && Dokument.leinwand();
    lauf = { bild: [], eigen: [], block: [], zeiger: 0, zeigerMs: [], stat: lw && lw.statistik ? lw.statistik() : null };
    const hinweis = document.createElement('div');
    hinweis.className = 'messung-hinweis';
    hinweis.setAttribute('role', 'status');
    document.body.appendChild(hinweis);
    const zeige = () => { hinweis.textContent = `Messung läuft: jetzt scrollen und schreiben · ${Math.max(0, Math.ceil(sekunden - (performance.now() - t0) / 1000))} s`; };
    zeige();
    const sek = setInterval(zeige, 1000);
    let letzt = t0, letztT = t0;
    const takt = () => { if (!lauf) return; const n = performance.now(); lauf.bild.push(n - letzt); letzt = n; requestAnimationFrame(takt); };
    requestAnimationFrame(takt);
    // Kommt der Zeitgeber (alle 4 ms) deutlich zu spät, war der Ablauf so lange blockiert
    const zt = setInterval(() => { const n = performance.now(), d = n - letztT; letztT = n; if (d > 24 && lauf) lauf.block.push([n - t0, d - 4]); }, 4);
    // Zeiger-Ereignisse: Anzahl und Dauer aller Hörer (vom Fenster hinunter und wieder herauf)
    let zeigerStart = 0;
    const rein = () => { zeigerStart = performance.now(); if (lauf) lauf.zeiger++; };
    const raus = () => { if (lauf && zeigerStart) lauf.zeigerMs.push(performance.now() - zeigerStart); zeigerStart = 0; };
    window.addEventListener('pointermove', rein, true);
    window.addEventListener('pointermove', raus, false);
    setTimeout(() => {
      clearInterval(sek); clearInterval(zt);
      window.removeEventListener('pointermove', rein, true);
      window.removeEventListener('pointermove', raus, false);
      hinweis.remove();
      const l = lauf;
      lauf = null;
      ok(werte(l, sekunden));
    }, sekunden * 1000);
  });

  // Messen und das Ergebnis in einem Dialog zeigen (zum Kopieren)
  M.zeige = async sekunden => {
    const e = await M.starte(sekunden);
    if (!e || !window.UI) return e;
    try { if (window.Daten) Daten.set('lokal:messung', { zeit: Date.now(), text: e.text }); } catch (x) { /* nur zum Nachlesen */ }
    await UI.oeffneDialog(`<div class="dialog-form">
        <h2>Messung</h2>
        <p class="dialog-klein">So flüssig lief es in den letzten ${e.sekunden} Sekunden. Zum Weitergeben: „Kopieren“ und einfügen.</p>
        <pre class="messung-text">${UI.esc(e.text)}</pre>
        <div class="dialog-knoepfe"><button type="button" class="btn-leise" data-kopieren>Kopieren</button><button type="button" class="btn-primaer" data-abbrechen>Fertig</button></div>
      </div>`, {
      init: d => {
        d.querySelector('[data-kopieren]').addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(e.text); UI.meldung('Kopiert'); }
          catch (x) { const r = document.createRange(); r.selectNodeContents(d.querySelector('.messung-text')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); UI.meldung('Text ist markiert: jetzt kopieren'); }
        });
      }
    });
    return e;
  };
  window.Messung = M;
})();
