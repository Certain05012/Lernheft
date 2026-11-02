'use strict';
// Nur in der Web-App (node baue.js web, z. B. auf GitHub Pages): dieselbe Brücke wie die iPad-App (bruecke.js), aber in
// Safari. Diese Datei lädt vor allen anderen: sie meldet die Web-App an (window.LHWebApp), bittet um dauerhaften
// Speicher und meldet den Service Worker (sw.js) an, der alle Dateien der App auf dem Gerät hält, damit sie auch ohne
// Netz startet.
//
// Updates: Bei jedem Start (und beim Zurückkehren in die App) fragt Safari, ob es eine neue sw.js gibt. Wenn ja, lädt der
// neue Service Worker alle Dateien und übernimmt (controllerchange). Die laufende Seite ist dann noch die alte: sie
// sichert alles und lädt sich neu, gleich beim Start (in den ersten Sekunden) oder sobald man in die App zurückkehrt.
// Dazwischen (man schreibt gerade) erscheint nur ein Hinweis mit "Neu laden".
(function () {
  window.LHWebApp = true;
  const START = Date.now();
  const SOFORT_MS = 20000;

  // Safari löscht Daten von Webseiten sonst bei Platzmangel (und Seiten, die nicht auf dem Home-Bildschirm liegen,
  // nach einigen Wochen ohne Besuch)
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* optional */ }

  // Ohne https kein Service Worker (ausser localhost zum Testen)
  if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) return;

  const hatteVersion = !!navigator.serviceWorker.controller;
  let wartet = false, laedt = false;
  async function neuLaden() {
    if (laedt) return;
    laedt = true;
    // Erst alles sichern: Striche und Text, die gerade erst entstanden sind, liegen sonst noch im Arbeitsspeicher
    try { if (window.lernheftDesktop && lernheftDesktop.sichereAlles) await lernheftDesktop.sichereAlles(); } catch (e) { /* trotzdem neu laden */ }
    location.reload();
  }
  function neueVersionDa() {
    if (!hatteVersion || wartet) return;   // allererste Installation: die Seite ist schon die neue
    wartet = true;
    if (Date.now() - START < SOFORT_MS) { neuLaden(); return; }
    const zeige = () => {
      if (window.UI && UI.meldung) UI.meldung('Neue Version des Lernhefts ist da', { text: 'Neu laden', fn: neuLaden });
      else setTimeout(zeige, 1000);
    };
    zeige();
  }
  navigator.serviceWorker.addEventListener('controllerchange', neueVersionDa);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    // Zurück in der App: eine wartende Version gleich übernehmen (man schreibt in diesem Moment nicht)
    if (wartet) { neuLaden(); return; }
    navigator.serviceWorker.getRegistration().then(reg => reg && navigator.onLine !== false && reg.update()).catch(() => {});
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      // Sofort nach Updates sehen, nicht erst, wenn Safari es von selbst tut
      if (navigator.onLine !== false) reg.update().catch(() => {});
    }).catch(e => console.error('Lernheft: Service Worker', e));
  });
})();
