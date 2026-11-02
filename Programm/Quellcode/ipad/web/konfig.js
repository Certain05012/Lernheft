'use strict';
// Einstellungen der iPad-App. Die App gleicht mit OneDrive oder Dropbox ab; welche, wählst du beim ersten Start.
// clientId = "Anwendungs-ID (Client-ID)" aus der App-Registrierung bei Microsoft (Anleitung: ipad/ANLEITUNG.md, Schritt 1a),
// dropboxAppKey = "App key" aus der App bei Dropbox (Anleitung, Schritt 1b). Beide sind keine Geheimnisse: sie sagen
// Microsoft bzw. Dropbox nur, welche App sich anmelden will. Fehlen sie, lassen sie sich auch beim Einrichten unter
// "Erweitert" eintragen.
window.LHKonfig = {
  clientId: '',
  dropboxAppKey: '',
  // Ordner in der Cloud (ab dem Stamm), derselbe wie der Speicherort am PC
  // (dort: C:\Users\…\OneDrive\Lernheft bzw. C:\Users\…\Dropbox\Lernheft)
  ordner: 'Lernheft',
  // Rückkehr in die App nach der Anmeldung (so auch bei Microsoft unter "Mobilgerät- und Desktopanwendungen" und bei
  // Dropbox unter "Redirect URIs" eintragen)
  zurueckIos: 'ch.lernheft.app://auth',
  // Wie oft im Hintergrund abgeglichen wird, solange die App offen ist
  abgleichAlleMs: 30000
};
