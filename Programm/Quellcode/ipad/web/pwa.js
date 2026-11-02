'use strict';
// Nur in der Web-App (node baue.js web, z. B. auf GitHub Pages): dieselbe Brücke wie die iPad-App (bruecke.js), aber in
// Safari. Diese Datei lädt vor allen anderen: sie meldet die Web-App an (window.LHWebApp), bittet um dauerhaften
// Speicher und meldet den Service Worker (sw.js) an, der alle Dateien der App auf dem Gerät hält, damit sie auch ohne
// Netz startet. Neue Versionen lädt er im Hintergrund; sie gelten ab dem nächsten Start.
(function () {
  window.LHWebApp = true;

  // Safari löscht Daten von Webseiten sonst bei Platzmangel (und Seiten, die nicht auf dem Home-Bildschirm liegen,
  // nach einigen Wochen ohne Besuch)
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* optional */ }

  // Ohne https kein Service Worker (ausser localhost zum Testen)
  if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const neu = reg.installing;
        if (!neu) return;
        neu.addEventListener('statechange', () => {
          // Nur melden, wenn es schon eine Version gab (nicht beim allerersten Laden)
          if (neu.state === 'activated' && navigator.serviceWorker.controller && window.UI && UI.meldung) {
            UI.meldung('Neue Version geladen, gilt ab dem nächsten Start');
          }
        });
      });
      // Bei jedem Wechsel zurück in die App nach Updates sehen (die App bleibt auf dem iPad oft tagelang offen)
      document.addEventListener('visibilitychange', () => { if (!document.hidden && navigator.onLine !== false) reg.update().catch(() => {}); });
    }).catch(e => console.error('Lernheft: Service Worker', e));
  });
})();
