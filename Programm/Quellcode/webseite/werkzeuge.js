'use strict';
// Werkzeugleiste für eine Leinwand: Hand, Stift, Marker, Radierer, Lasso, Haftnotiz, Text, Farben, Grösse, Verlauf
(function () {
  const STANDARD = {
    werkzeug: 'stift', farbe: 'tinte', markerFarbe: 'gelb', eigeneFarben: [], eigeneMarker: [], dicke: 3, markerDicke: 3.5, radierGroesse: 14,
    seite: 'lasso', radier: 'radierer', druck: true, druckModus: 'pencil', neigung: false, neigungAb: 30, druckKurve: 1, druckMin: 0, druckMax: 1,
    finger: false, radiermodus: 'strich', notizFarbe: 'gelb', laserFarbe: '#ff2d2d', textFarbe: 'tinte',
    glaettung: 'niedrig', halteForm: true, halteMs: 700, kritzelLoeschen: true, gesten: {},
    stiftArt: 'fueller', schwebeVorschau: true, kreisAuswahl: true, federDrehung: true
  };
  // Drei Grössen je Werkzeug in Millimetern (Stift, Marker: Strichbreite; Radierer: Durchmesser), jede lässt sich mit
  // dem Regler einstellen und bleibt gespeichert
  // Text: Schriftgrösse in Punkt
  const PRESETS = { stift: { klein: 0.25, mittel: 0.45, gross: 0.8 }, marker: { klein: 0.5, mittel: 0.9, gross: 1.6 }, radierer: { klein: 3, mittel: 7, gross: 15 }, laser: { klein: 2.5, mittel: 4, gross: 7 }, text: { klein: 12, mittel: 18, gross: 28 } };
  // Frühere Version: dieselben Grössen in Einheiten der Schreibfläche (px bei 100 %), der Radierer als Radius
  const PRESETS_PX = { stift: { klein: 1.5, mittel: 3, gross: 6 }, marker: { klein: 2, mittel: 3.5, gross: 6 }, radierer: { klein: 6, mittel: 14, gross: 28 }, laser: { klein: 9, mittel: 15, gross: 26 } };
  const PRESET_NAMEN = { klein: 'Klein', mittel: 'Mittel', gross: 'Gross' };
  // k: Feld der aktuellen Grösse in Einheiten der Schreibfläche (abgeleitet, wird nicht gespeichert); der Regler reicht
  // von min bis max Millimeter; px: Grösse des Punkts in der Anzeige
  const GROESSE = {
    stift: { k: 'dicke', min: 0.1, max: 2.5, step: 0.05, titel: 'Stiftbreite', px: mm => mm * 10 },
    marker: { k: 'markerDicke', min: 0.5, max: 8, step: 0.1, titel: 'Markerbreite', px: mm => mm * 9 },
    radierer: { k: 'radierGroesse', min: 1, max: 30, step: 0.5, titel: 'Radierer-Durchmesser', px: mm => mm * 3 },
    laser: { k: 'laserGroesse', min: 1.5, max: 12, step: 0.5, titel: 'Laserpunkt-Durchmesser', px: mm => mm * 2.4 },
    text: { k: 'textGroesse', min: 8, max: 96, step: 1, titel: 'Schriftgrösse', px: pt => pt * 0.55, einheit: 'pt' }
  };
  // Was auf allen Geräten gleich sein soll (Datei Einstellungen, liegt im Speicherort), und was am Gerät hängt
  // (Stift, Bildschirm, Treiber: Druckkurve, Tastenbelegung, Finger, Glättung)
  const SYNC = ['presets', 'preset', 'einheit', 'farbe', 'markerFarbe', 'eigeneFarben', 'eigeneMarker', 'radiermodus', 'notizFarbe', 'laserFarbe', 'textFarbe', 'stiftGroessen2', 'stiftArt'];
  const ABGELEITET = ['dicke', 'markerDicke', 'radierGroesse', 'laserGroesse', 'textGroesse'];
  // Farben des Laserpunkts (Standard: Rot)
  const LASERFARBEN = { rot: '#ff2d2d', gruen: '#22e06a', blau: '#3d8bff', gelb: '#ffe030', magenta: '#ff3df0', weiss: '#ffffff' };
  const LASERNAMEN = { rot: 'Rot', gruen: 'Grün', blau: 'Blau', gelb: 'Gelb', magenta: 'Magenta', weiss: 'Weiss' };
  const MAX_EIGENE = 10;
  const istHex = f => typeof f === 'string' && /^#[0-9a-f]{6}$/i.test(f);
  const zwischen = (w, a, c) => Math.max(a, Math.min(c, w));
  const raster = (w, schritt) => Math.round(Math.round(w / schritt) * schritt * 100) / 100;

  // Gemeinsame Einstellungen für alle Leinwände auf diesem Gerät
  let einst = null;
  function ordnePresets() {
    const p = einst.presets && typeof einst.presets === 'object' ? einst.presets : {};
    einst.presets = {};
    einst.preset = einst.preset && typeof einst.preset === 'object' ? einst.preset : {};
    for (const art of Object.keys(GROESSE)) {
      const g = GROESSE[art];
      einst.presets[art] = {};
      for (const n of Object.keys(PRESET_NAMEN)) {
        const v = Number(p[art] && p[art][n]);
        einst.presets[art][n] = v > 0 ? zwischen(raster(v, g.step), g.min, g.max) : PRESETS[art][n];
      }
      if (!PRESET_NAMEN[einst.preset[art]]) einst.preset[art] = 'mittel';
      einst[g.k] = Leinwand.einheit(art, einst.presets[art][einst.preset[art]]);
    }
  }
  // Grössen aus früherer Version (Einheiten der Schreibfläche) in Millimeter umrechnen, einmalig
  function aufMillimeter() {
    if (einst.einheit === 'mm') return;
    const alt = einst.presets && typeof einst.presets === 'object' ? einst.presets : null;
    const neu = {};
    for (const art of Object.keys(GROESSE)) {
      if (!PRESETS_PX[art]) continue;
      const einzel = Number(einst[GROESSE[art].k]);
      const quelle = alt && alt[art] ? alt[art] : Object.assign({}, PRESETS_PX[art], einzel > 0 ? { mittel: einzel } : {});
      neu[art] = {};
      for (const n of Object.keys(PRESET_NAMEN)) {
        const v = Number(quelle[n]), px = v > 0 ? v : PRESETS_PX[art][n];
        neu[art][n] = art === 'radierer' ? px * 2 / Leinwand.MM : px / Leinwand.MM;
      }
    }
    einst.presets = neu;
    einst.einheit = 'mm';
  }
  function einstellungen() {
    if (!einst) {
      const lokal = Daten.get('lokal:stift', {}), geteilt = Daten.get('einst:stift', null);
      einst = Object.assign({}, STANDARD, lokal, geteilt || {});
      // Früher hiess Schwarz "tinte" und Blau war Standard; beides bleibt gültig
      if (!Leinwand.TINTE.hell[einst.farbe] && !istHex(einst.farbe)) einst.farbe = 'tinte';
      if (!Leinwand.MARKER[einst.markerFarbe] && !istHex(einst.markerFarbe)) einst.markerFarbe = 'gelb';
      if (!Leinwand.TINTE.hell[einst.textFarbe] && !istHex(einst.textFarbe)) einst.textFarbe = 'tinte';
      if (!istHex(einst.laserFarbe)) einst.laserFarbe = STANDARD.laserFarbe;
      // Früher drei feste Radiergrössen, jetzt ein Regler
      const alt = { klein: 6, mittel: 14, gross: 28 }[einst.radiermodus];
      if (alt) einst.radierGroesse = alt;
      if (einst.radiermodus !== 'strich') einst.radiermodus = 'bereich';
      // Bisherige Grössen (Pixel, ein Wert je Werkzeug oder drei) werden in Millimeter umgerechnet
      aufMillimeter();
      ordnePresets();
      if (!GLAETTUNGEN.includes(einst.glaettung)) einst.glaettung = 'niedrig';
      // Version 3.9: einmal auf das neue Schreibgefühl umstellen (weniger Nachziehen, Breite ohne Neigung wie beim
      // Stift in Apple Notizen). Beides lässt sich im Stift-Panel wieder ändern.
      // Version 3.9.2: feinere Stiftgrössen (vorher 0,4 / 0,8 / 1,6 mm, die meisten schrieben nur bis 0,8). Einmal für
      // alle Geräte (stiftGroessen2 wird mit dem Speicherort abgeglichen), danach bleibt, was man einstellt.
      if (!einst.stiftGroessen2) {
        einst.presets.stift = { ...PRESETS.stift };
        einst.stiftGroessen2 = true;
        ordnePresets();
        speichereEinst();
      }
      // Version 3.11: Glättung ohne Nachziehen (Mittel aus Nachbarn vor und nach jedem Punkt), Niedrig nimmt nur das
      // Zittern weg. Einmal für alle, danach bleibt, was man einstellt.
      if (!einst.schreibgefuehl4) {
        einst.glaettung = 'niedrig';
        einst.schreibgefuehl2 = einst.schreibgefuehl3 = einst.schreibgefuehl4 = true;
        speichereEinst();
      }
      if (!einst.schreibgefuehl2) {
        if (einst.glaettung === 'mittel' || einst.glaettung === 'hoch') einst.glaettung = 'niedrig';
        einst.neigung = false;
        einst.schreibgefuehl2 = true;
        speichereEinst();
      }
      for (const k of ['eigeneFarben', 'eigeneMarker']) einst[k] = (Array.isArray(einst[k]) ? einst[k] : []).filter(istHex).slice(-MAX_EIGENE);
      if (!geteilt || geteilt.einheit !== 'mm') speichereEinst();
    }
    return einst;
  }
  // Alle offenen Leisten (Whiteboard, Tabs) zeigen dieselben Einstellungen
  const leisten = new Set();
  function speichereEinst() {
    if (!einst) return;
    const geteilt = {}, lokal = {};
    for (const k of Object.keys(einst)) {
      if (ABGELEITET.includes(k)) continue;
      (SYNC.includes(k) ? geteilt : lokal)[k] = einst[k];
    }
    Daten.set('lokal:stift', lokal);
    Daten.set('einst:stift', geteilt);
    leisten.forEach(l => l.aktualisiere());
  }
  // Ein anderes Gerät (oder Fenster) hat die gemeinsamen Einstellungen geändert
  Daten.on(({ key, quelle }) => {
    if (key !== 'einst:stift' || quelle === 'lokal' || !einst) return;
    const neu = Daten.get('einst:stift');
    // Ein Gerät mit der älteren Version schreibt Pixel statt Millimeter: dessen Grössen nicht übernehmen
    if (!neu) return;
    if (neu.einheit !== 'mm') { delete neu.presets; delete neu.preset; }
    Object.assign(einst, neu);
    ordnePresets();
    leisten.forEach(l => l.aktualisiere());
  });

  const SVG = {
    hand: '<path d="M8 12.5V6a1.5 1.5 0 013 0v5.5"/><path d="M11 11V4.5a1.5 1.5 0 013 0V11"/><path d="M14 11V6a1.5 1.5 0 013 0v7.5c0 4-2.6 7-6.5 7-2.4 0-3.9-1-5.1-2.7l-2.2-3.3a1.5 1.5 0 012.4-1.8L8 14.5"/>',
    finger: '<path d="M10 12V4.5a1.5 1.5 0 013 0V11"/><path d="M13 10.5a1.5 1.5 0 013 0V12"/><path d="M16 11.5a1.5 1.5 0 013 0V15c0 3.4-2.4 6-5.8 6H12c-2 0-3.3-.9-4.4-2.4L5.3 15.4a1.5 1.5 0 012.4-1.8l2.3 2.6"/><path d="M3 8.5c1.3-2 2.7-2 4 0"/>',
    stift: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
    marker: '<path d="M9 14l7-10 4 3-7 10z"/><path d="M9 14l-2 3 3 1 3-1"/><path d="M4 21h9"/>',
    radierer: '<path d="M15 4l5 5-9 9H7l-3-3z"/><path d="M9 10l5 5"/><path d="M11 20h9"/>',
    lasso: '<ellipse cx="12" cy="9" rx="8" ry="5" stroke-dasharray="3 2.5"/><path d="M7 13c-1 3 0 6 3 7"/>',
    notiz: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/>',
    text: '<path d="M5 7V4.5h14V7"/><path d="M12 4.5v15"/><path d="M9 19.5h6"/>',
    laser: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9L18 18M18 6l-2.1 2.1M8.1 15.9L6 18"/>',
    plus: '<path d="M12 6v12M6 12h12"/>',
    // Stiftarten: Feder des Füllers, Mine des Kugelschreibers, weiche Spitze des Pinsels
    fueller: '<path d="M12 21l-5-9 3-8h4l3 8z"/><path d="M12 21v-7"/><circle cx="12" cy="12.6" r="1.3"/>',
    kugel: '<path d="M9 3h6v10l-2 5h-2l-2-5z"/><path d="M9 7h6"/><path d="M12 18v3"/>',
    pinsel: '<path d="M10 3h4v7c0 1.6 2 2.6 2 5.2 0 3.2-2.2 5.8-4 5.8s-4-2.6-4-5.8c0-2.6 2-3.6 2-5.2z"/><path d="M10 7h4"/>',
    palette: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="7.6" r="1.4" class="voll"/><circle cx="7.9" cy="13.6" r="1.4" class="voll"/><circle cx="16.1" cy="13.6" r="1.4" class="voll"/>',
    zoom: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M8.5 11h5"/>',
    // Seite drehen: ein Blatt mit einem Bogen darüber (anders als Rückgängig/Wiederholen, die nur Pfeile sind)
    links: '<rect x="9.5" y="9" width="10" height="12" rx="1.6"/><path d="M15 4.5H9.5a5 5 0 00-5 5V12"/><path d="M2 9.6l2.5 2.6 2.6-2.6"/>',
    rechts: '<rect x="4.5" y="9" width="10" height="12" rx="1.6"/><path d="M9 4.5h5.5a5 5 0 015 5V12"/><path d="M16.9 9.6l2.6 2.6 2.5-2.6"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
    tasten: '<path d="M8 3h8v14l-4 4-4-4z"/><path d="M10 7h4"/><path d="M10 10h4"/>',
    eigenschaften: '<path d="M12 3.5a8.5 8.5 0 100 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.7 0-1 .8-1.6 1.8-1.6h2.1c2 0 3.8-1.6 3.8-3.8C20.5 6.6 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11.5" r="1.2"/><circle cx="10" cy="7.6" r="1.2"/><circle cx="14.6" cy="7.6" r="1.2"/>'
  };
  // Gestaltete Symbole (Werkzeugleiste mit "Farbige Symbole"): Werkzeuge mit Körper, Licht und Schatten; die Spitze des
  // Stifts und der Textmarker zeigen die gewählte Farbe (--wz-tinte, --wz-marker, gesetzt in aktualisiere). Nur Flächen
  // in einer festen SVG, kostet beim Zeichnen nichts.
  const BUNT = {
    hand: '<path d="M8 12.5V6.2a1.6 1.6 0 013.2 0v5.3V4.7a1.6 1.6 0 013.2 0V11V6.3a1.6 1.6 0 013.2 0v7.4c0 4.1-2.7 7.2-6.7 7.2-2.5 0-4-1-5.3-2.8l-2.3-3.4a1.6 1.6 0 012.6-1.9L8 14.6z" fill="var(--b-haut)" stroke="var(--b-kontur)" stroke-width="1.2" stroke-linejoin="round"/><path d="M11.2 11.5V8M14.4 11V8.5" stroke="var(--b-kontur)" stroke-width="1" stroke-linecap="round" opacity=".45"/>',
    finger: '<path d="M3.5 20.5c2-1.6 3.6-1.6 5.2 0" fill="none" stroke="var(--wz-tinte)" stroke-width="2" stroke-linecap="round"/><path d="M10 12V4.6a1.6 1.6 0 013.2 0V11v-.4a1.6 1.6 0 013.2 0V12v-.3a1.6 1.6 0 013.1 0V15c0 3.4-2.4 6-5.8 6h-1.3c-2 0-3.3-.9-4.4-2.4L5.6 15.3a1.6 1.6 0 012.6-1.9L10 15.5z" fill="var(--b-haut)" stroke="var(--b-kontur)" stroke-width="1.2" stroke-linejoin="round"/>',
    stift: '<g transform="rotate(45 12 12)"><rect x="9.6" y="0.8" width="4.8" height="15.6" rx="1.7" fill="var(--b-schaft)"/><rect x="10.5" y="2.4" width="1.1" height="12" rx=".55" fill="#fff" opacity=".35"/><rect x="9.6" y="14.2" width="4.8" height="2.4" fill="var(--b-metall)"/><path d="M9.7 16.6h4.6L12.6 21.6a.7.7 0 01-1.2 0z" fill="var(--b-holz)"/><path d="M11.1 19.8h1.8l-.6 1.8a.35.35 0 01-.6 0z" fill="var(--wz-tinte)"/><rect x="9.6" y="0.8" width="4.8" height="3" rx="1.5" fill="var(--wz-tinte)"/></g>',
    marker: '<rect x="2.5" y="18.3" width="11" height="3.6" rx="1.2" fill="var(--wz-marker)" opacity=".5"/><g transform="rotate(40 12 12)"><rect x="8.6" y="0.6" width="6.8" height="12.6" rx="1.8" fill="var(--b-schaft)"/><rect x="9.6" y="2.2" width="1.3" height="9.4" rx=".65" fill="#fff" opacity=".35"/><rect x="8.6" y="11.6" width="6.8" height="3" fill="var(--wz-marker)"/><path d="M9.6 14.6h4.8l-.7 4.4h-3.4z" fill="var(--b-metall)"/><path d="M10.4 19h3.2l-.5 2.2h-2.2z" fill="var(--wz-marker)"/></g>',
    radierer: '<path d="M4 21h15" stroke="var(--b-kontur)" stroke-width="1.4" stroke-linecap="round" opacity=".5"/><g transform="rotate(-40 12 12)"><rect x="3.4" y="7.6" width="17.2" height="8.8" rx="2.4" fill="#ff7aa2"/><rect x="3.4" y="7.6" width="7" height="8.8" rx="2.4" fill="var(--b-papier)"/><rect x="8.4" y="7.6" width="2" height="8.8" fill="var(--b-papier)"/><rect x="3.4" y="7.6" width="17.2" height="8.8" rx="2.4" fill="none" stroke="var(--b-kontur)" stroke-width="1" opacity=".35"/><rect x="12" y="9.2" width="7" height="1.3" rx=".65" fill="#fff" opacity=".4"/></g>',
    lasso: '<ellipse cx="12" cy="9.2" rx="8.4" ry="5.4" fill="#a78bfa" opacity=".18"/><ellipse cx="12" cy="9.2" rx="8.4" ry="5.4" fill="none" stroke="#8b5cf6" stroke-width="1.9" stroke-dasharray="3.2 2.4" stroke-linecap="round"/><path d="M6.8 13.4c-1.2 3-.4 6 2.6 7.4" fill="none" stroke="#8b5cf6" stroke-width="1.9" stroke-linecap="round"/><circle cx="9.6" cy="21" r="1.5" fill="#8b5cf6"/>',
    notiz: '<path d="M4.5 4.8a1.3 1.3 0 011.3-1.3h12.4a1.3 1.3 0 011.3 1.3V15l-5.5 5.5H5.8a1.3 1.3 0 01-1.3-1.3z" fill="#ffd84d"/><path d="M14 20.5V16.3a1.3 1.3 0 011.3-1.3h4.2z" fill="#e8a800"/><path d="M7.5 8h9M7.5 11h9M7.5 14h5" stroke="#b07f00" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>',
    text: '<rect x="2.8" y="2.8" width="18.4" height="18.4" rx="4.6" fill="var(--b-kachel)"/><path d="M7.4 8.2V6.6h9.2v1.6M12 6.6v10.8M10 17.4h4" fill="none" stroke="var(--b-textfarbe)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
    laser: '<circle cx="12" cy="12" r="9" fill="#ff3b3b" opacity=".14"/><circle cx="12" cy="12" r="6" fill="#ff3b3b" opacity=".3"/><circle cx="12" cy="12" r="3.6" fill="#ff3b3b"/><circle cx="11" cy="11" r="1.3" fill="#fff" opacity=".9"/>',
    undo: '<path d="M9 14L4 9l5-5" fill="none" stroke="var(--b-pfeil)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h10a6 6 0 010 12h-3" fill="none" stroke="var(--b-pfeil)" stroke-width="2.1" stroke-linecap="round"/>',
    redo: '<path d="M15 14l5-5-5-5" fill="none" stroke="var(--b-pfeil)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 9H10a6 6 0 000 12h3" fill="none" stroke="var(--b-pfeil)" stroke-width="2.1" stroke-linecap="round"/>',
    links: '<rect x="9.5" y="9" width="10" height="12" rx="1.6" fill="var(--b-papier)" stroke="var(--b-kontur)" stroke-width="1.2"/><path d="M11.8 12.5h5.4M11.8 15h5.4M11.8 17.5h3.4" stroke="var(--b-kontur)" stroke-width="1" stroke-linecap="round" opacity=".4"/><path d="M15 4.5H9.5a5 5 0 00-5 5V12" fill="none" stroke="#14b8a6" stroke-width="2" stroke-linecap="round"/><path d="M2 9.6l2.5 2.6 2.6-2.6" fill="none" stroke="#14b8a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    rechts: '<rect x="4.5" y="9" width="10" height="12" rx="1.6" fill="var(--b-papier)" stroke="var(--b-kontur)" stroke-width="1.2"/><path d="M6.8 12.5h5.4M6.8 15h5.4M6.8 17.5h3.4" stroke="var(--b-kontur)" stroke-width="1" stroke-linecap="round" opacity=".4"/><path d="M9 4.5h5.5a5 5 0 015 5V12" fill="none" stroke="#14b8a6" stroke-width="2" stroke-linecap="round"/><path d="M16.9 9.6l2.6 2.6 2.5-2.6" fill="none" stroke="#14b8a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    tasten: '<g transform="rotate(45 12 12)"><rect x="9.4" y="1.2" width="5.2" height="16" rx="2.4" fill="var(--b-schaft)"/><rect x="10.3" y="5" width="3.4" height="4.6" rx="1.2" fill="#c084fc"/><path d="M9.6 17.2h4.8L12.6 21.8a.7.7 0 01-1.2 0z" fill="var(--b-metall)"/></g>',
    eigenschaften: '<path d="M12 3.2a8.8 8.8 0 100 17.6c1.3 0 2-.8 2-1.8 0-1.3-1-1.7-1-2.8 0-1 .8-1.7 1.9-1.7h2.2c2.1 0 3.9-1.7 3.9-3.9C21 6.4 17 3.2 12 3.2z" fill="var(--b-papier)" stroke="var(--b-kontur)" stroke-width="1.2"/><circle cx="7.6" cy="11.6" r="1.6" fill="var(--wz-tinte)"/><circle cx="9.9" cy="7.4" r="1.6" fill="#3b82f6"/><circle cx="14.6" cy="7.2" r="1.6" fill="#ef4444"/><circle cx="17.4" cy="10.6" r="1.6" fill="#f5b700"/>'
  };
  const icon = n => `<svg class="sym${BUNT[n] ? ' hat-bunt' : ''}" viewBox="0 0 24 24" aria-hidden="true">${SVG[n]}</svg>${BUNT[n] ? `<svg class="sym-bunt" viewBox="0 0 24 24" aria-hidden="true">${BUNT[n]}</svg>` : ''}`;
  const WERKZEUGE = [['hand', 'Hand: Fläche verschieben (H)'], ['stift', 'Stift (P)'], ['marker', 'Textmarker (M)'], ['radierer', 'Radierer (E)'], ['lasso', 'Lasso: auswählen, verschieben, grösser/kleiner (L)'], ['notiz', 'Haftnotiz (N)'], ['text', 'Text: tippen und schreiben, Grösse und Farbe wählen (T)'], ['laser', 'Laserpointer: leuchtender Punkt mit Spur, nichts wird gezeichnet (R)']];
  const zahl = w => String(w).replace('.', ',');
  const STIFTART_TITEL = { fueller: 'Füller: Druck gibt die Breite, schnelle Züge werden feiner', kugel: 'Kugelschreiber: überall gleich breit', pinsel: 'Pinselstift: setzt fein an, wird breit und läuft spitz aus' };
  const GESTEN_LISTE = [['zweiFinger', 'Zwei Finger tippen'], ['dreiFinger', 'Drei Finger tippen'], ['zweiFingerLang', 'Zwei Finger halten'], ['pencilDoppel', 'Pencil doppelt tippen (iPad-App)'], ['pencilDruecken', 'Pencil zusammendrücken (iPad-App, Pencil Pro)']];
  // Was in der Leiste stehen kann (zum Ein- und Ausblenden, Werkzeugleiste anpassen)
  const LEISTE_TEILE = [['w:hand', 'Hand'], ['w:stift', 'Stift'], ['w:marker', 'Textmarker'], ['w:radierer', 'Radierer'], ['w:lasso', 'Lasso'], ['w:notiz', 'Haftnotiz'], ['w:text', 'Text'], ['w:laser', 'Laserpointer'],
    ['a:finger', 'Mit dem Finger schreiben'], ['a:undo', 'Rückgängig'], ['a:redo', 'Wiederholen'], ['a:tasten', 'Stift einstellen'], ['a:links', 'Seite nach links drehen'], ['a:rechts', 'Seite nach rechts drehen'], ['a:zoom', 'Zoom (Einpassen)']];
  const AUS_KEY = 'lokal:leiste-aus', FARBIG_KEY = 'lokal:leiste-farbig';
  const GLAETTUNGEN = ['aus', 'niedrig', 'mittel', 'hoch'];

  document.addEventListener('change', ev => {
    const k = ev.target;
    if (!k || k.name !== 'farbig' || !k.closest) return;
    const w = k.closest('.dialog-form') && k.closest('.dialog-form').querySelector('.leiste-wahl');
    if (w) w.classList.toggle('farbig', k.checked);
  });

  function baue(leiste, lw) {
    const e = lw.einst;
    const fl = () => Leinwand.flaecheThema();
    const plus = art => `<label class="wz plus" title="Weitere Farbe wählen" aria-label="Weitere ${art === 'marker' ? 'Markerfarbe' : art === 'text' ? 'Textfarbe' : 'Stiftfarbe'}">${icon('plus')}<input type="color" data-plus="${art}" tabindex="-1"></label>`;
    leiste.classList.add('werkzeugleiste');
    leiste.innerHTML = `
      <div class="leiste-anfang" data-anfang></div>
      <div class="gruppe" role="group" aria-label="Werkzeug">
        ${WERKZEUGE.map(([w, t]) => `<button class="wz" type="button" data-ord="w:${w}" data-werkzeug="${w}" title="${t}" aria-label="${t}">${icon(w)}</button>`).join('')}
      </div>
      <div class="gruppe" role="group" aria-label="Finger">
        <button class="wz" type="button" data-ord="a:finger" data-aktion="finger" title="Mit dem Finger schreiben: ein Finger schreibt mit dem gewählten Werkzeug, zwei Finger verschieben und zoomen" aria-label="Mit dem Finger schreiben">${icon('finger')}</button>
      </div>
      <button class="wz eig-knopf" type="button" data-aktion="eigenschaften" title="Eigenschaften: Farbe und Grösse" aria-label="Eigenschaften" aria-pressed="false">${icon('eigenschaften')}</button>
      <div class="gruppe" role="group" aria-label="Radierer" data-nur="radierer" data-eig>
        <button class="wz wz-text" type="button" data-radiermodus="strich" title="Ganze Striche radieren">Strich</button>
        <button class="wz wz-text" type="button" data-radiermodus="bereich" title="Nur den Bereich unter dem Radierer entfernen (Grösse mit dem Regler)">Bereich</button>
      </div>
      <div class="gruppe stiftarten" role="radiogroup" aria-label="Stiftart" data-nur="stift" data-eig>
        ${Object.entries(Leinwand.STIFTARTEN).map(([a, n]) => `<button class="wz" type="button" role="radio" data-stiftart="${a}" title="${STIFTART_TITEL[a]}" aria-label="${n}">${icon(a)}</button>`).join('')}
      </div>
      <div class="gruppe farbreihe" role="group" aria-label="Farbe der Haftnotiz" data-nur="notiz" data-eig>
        ${Object.entries(Leinwand.NOTIZFARBEN).map(([f, c]) => `<button class="wz" type="button" data-notizfarbe="${f}" title="Notiz ${Leinwand.NOTIZNAMEN[f]}" aria-label="Notiz ${Leinwand.NOTIZNAMEN[f]}"><span class="notizpunkt" style="--farbe: ${c}"></span></button>`).join('')}
      </div>
      <div class="gruppe farbreihe" role="group" aria-label="Farbe des Laserpunkts" data-nur="laser" data-eig>
        ${Object.entries(LASERFARBEN).map(([f, c]) => `<button class="wz" type="button" data-laserfarbe="${c}" title="Laser ${LASERNAMEN[f]}" aria-label="Laser ${LASERNAMEN[f]}"><span class="farbpunkt laser" style="--farbe: ${c}"></span></button>`).join('')}
        <label class="wz plus" title="Weitere Laserfarbe wählen" aria-label="Weitere Laserfarbe">${icon('plus')}<input type="color" data-plus="laser" tabindex="-1"></label>
      </div>
      <div class="gruppe farbreihe" role="group" aria-label="Stiftfarbe" data-farben="stift" data-eig>
        ${Object.keys(Leinwand.TINTE.hell).map(f => `<button class="wz" type="button" data-farbe="${f}" title="${Leinwand.FARBNAMEN[f]}" aria-label="${Leinwand.FARBNAMEN[f]}"><span class="farbpunkt"></span></button>`).join('')}
        <span class="eigene" data-eigene="stift"></span>
        ${plus('stift')}
      </div>
      <div class="gruppe farbreihe" role="group" aria-label="Textfarbe" data-nur="text" data-eig>
        ${Object.keys(Leinwand.TINTE.hell).map(f => `<button class="wz" type="button" data-textfarbe="${f}" title="Text ${Leinwand.FARBNAMEN[f]}" aria-label="Text ${Leinwand.FARBNAMEN[f]}"><span class="farbpunkt"></span></button>`).join('')}
        <span class="eigene" data-eigene="text"></span>
        ${plus('text')}
      </div>
      <div class="gruppe farbreihe" role="group" aria-label="Markerfarbe" data-farben="marker" data-eig>
        ${Object.entries(Leinwand.MARKER).map(([f, c]) => `<button class="wz" type="button" data-markerfarbe="${f}" title="Marker ${Leinwand.MARKERNAMEN[f]}" aria-label="Marker ${Leinwand.MARKERNAMEN[f]}"><span class="farbpunkt marker" style="--farbe: ${c}"></span></button>`).join('')}
        <span class="eigene" data-eigene="marker"></span>
        ${plus('marker')}
      </div>
      <div class="gruppe groesse-gruppe" role="group" aria-label="Grösse" data-eig>
        <div class="presets" role="radiogroup" aria-label="Drei Grössen, jede mit dem Regler einstellbar">
          ${Object.entries(PRESET_NAMEN).map(([n, t]) => `<button class="preset" type="button" role="radio" aria-checked="false" data-preset="${n}" title="${t}: wählen, dann mit dem Regler einstellen"><span class="preset-punkt" aria-hidden="true"></span><span class="preset-name">${t}</span><span class="preset-wert"></span></button>`).join('')}
        </div>
        <input class="dicke-regler" type="range" data-regler aria-label="Grösse">
        <span class="dicke-wert" aria-hidden="true"></span>
      </div>
      <div class="gruppe" role="group" aria-label="Bearbeiten">
        <button class="wz" type="button" data-ord="a:undo" data-aktion="undo" title="Rückgängig (Strg+Z)" aria-label="Rückgängig">${icon('undo')}</button>
        <button class="wz" type="button" data-ord="a:redo" data-aktion="redo" title="Wiederholen (Strg+Y)" aria-label="Wiederholen">${icon('redo')}</button>
        <button class="wz" type="button" data-ord="a:tasten" data-aktion="tasten" title="Stift einstellen: Tasten, Druck, Neigung, Gesten, Diagnose" aria-label="Stift einstellen" aria-pressed="false">${icon('tasten')}</button>
        <button class="wz" type="button" data-ord="a:links" data-aktion="links" data-nur-drehen title="Seite nach links drehen (90°)" aria-label="Seite nach links drehen">${icon('links')}</button>
        <button class="wz" type="button" data-ord="a:rechts" data-aktion="rechts" data-nur-drehen title="Seite nach rechts drehen (90°)" aria-label="Seite nach rechts drehen">${icon('rechts')}</button>
      </div>
      <button class="wb-zoom" type="button" data-aktion="zoom" data-sicht="a:zoom" title="Einpassen und zentrieren (0)">100 %</button>
      <div class="leiste-ende" data-ende></div>`;

    // Einstellungen für Stifttasten, Druck und Neigung samt Diagnose, schwebt unter der Leiste
    const panel = document.createElement('div');
    panel.className = 'tasten-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="panel-kopf"><h3>Stift einstellen</h3><button type="button" class="btn-leise klein" data-aktion="alle-einst">Alle Einstellungen …</button></div>
      <p class="dialog-klein">Hier steht, was am Stift dieses Geräts hängt: Druck, Neigung und Tasten. Stiftart, Glättung, Halten und Gesten findest du in den Einstellungen.</p>

      <h3>Stift prüfen</h3>
      <p>Schreibe im Feld: die Werte zeigen, was dein Stift meldet. Das Feld ist nur zum Testen, es bleibt nichts davon stehen.</p>
      <canvas class="diag-feld" width="300" height="110" aria-label="Testfeld für den Stift"></canvas>
      <dl class="diag-werte" aria-live="off">
        <dt>Gerät</dt><dd data-d="typ">–</dd>
        <dt>Druck</dt><dd><span class="diag-balken"><span data-d="druckbalken"></span></span><span data-d="druck">–</span></dd>
        <dt>Neigung</dt><dd data-d="neigung">–</dd>
        <dt>Drehung</dt><dd data-d="twist">–</dd>
        <dt>Tasten</dt><dd data-d="tasten">–</dd>
      </dl>
      <p class="diag-hinweis" data-d="hinweis"></p>
      <canvas class="diag-kurve" width="300" height="74" aria-label="Druckkurve"></canvas>
      <label>Druckgefühl <select data-t="druckModus"><option value="pencil">Wie Apple Pencil</option><option value="eigen">Eigene Kurve</option></select></label>
      <div class="diag-pencil">
        <p class="dialog-klein">Leicht aufsetzen gibt feine, fest drücken dicke Linien, fliessend und ohne Schwelle. Die Kurve stellt sich beim Schreiben auf deinen Stift ein: dein gewohnter Druck gibt die mittlere Breite.</p>
        <p class="dialog-klein">Gewohnter Druck: <span data-w="druckTypisch"></span></p>
        <div class="diag-knoepfe"><button type="button" class="btn-leise klein" data-aktion="druck-neu">Neu einstellen lassen</button></div>
      </div>
      <div class="diag-eigen">
        <label>Kurve <span class="diag-wert" data-w="druckKurve"></span><input type="range" data-t="druckKurve" min="0.4" max="2.5" step="0.05"><span class="diag-enden"><span>weich: wenig Druck reicht</span><span>fest</span></span></label>
        <label>Mindestdruck <span class="diag-wert" data-w="druckMin"></span><input type="range" data-t="druckMin" min="0" max="0.3" step="0.01"></label>
        <label>Maximaldruck <span class="diag-wert" data-w="druckMax"></span><input type="range" data-t="druckMax" min="0.4" max="1" step="0.01"></label>
        <div class="diag-knoepfe">
          <button type="button" class="btn-leise klein" data-aktion="messen">Maximaldruck messen</button>
          <button type="button" class="btn-leise klein" data-aktion="kurve-null">Zurücksetzen</button>
        </div>
      </div>
      <label class="haken-label"><input type="checkbox" data-t="druck"> Drucksensibel: fester drücken gibt dickere Linien</label>
      <label class="haken-label"><input type="checkbox" data-t="neigung"> Neigung: flach gehalten gibt breitere Linien (wie ein Bleistift)</label>
      <label>Neigung ab <span class="diag-wert" data-w="neigungAb"></span><input type="range" data-t="neigungAb" min="10" max="60" step="1"></label>

      <h3>Tasten und Finger</h3>
      <p>Halte eine Taste am Stift gedrückt und tippe auf die Fläche. Unten siehst du, welche Taste erkannt wurde.</p>
      <label>Seitentaste <select data-t="seite"><option value="lasso">Lasso</option><option value="radierer">Radierer</option><option value="marker">Textmarker</option><option value="hand">Hand</option><option value="aus">Keine Funktion</option></select></label>
      <label>Radiertaste oder Stiftende <select data-t="radier"><option value="radierer">Radierer</option><option value="lasso">Lasso</option><option value="marker">Textmarker</option><option value="hand">Hand</option><option value="aus">Keine Funktion</option></select></label>
      <label class="haken-label"><input type="checkbox" data-t="finger"> Mit dem Finger schreiben (zwei Finger verschieben und zoomen)</label>
      <p class="tasten-test">Noch keine Stifttaste erkannt.</p>
      <p class="dialog-klein">Druckkurve und Tasten gelten nur für dieses Gerät, sie hängen vom Stift ab. Die drei Grössen werden mit dem Speicherort abgeglichen.</p>`;
    lw.el ? lw.el.appendChild(panel) : leiste.after(panel);

    const hexVon = (f, palette) => (istHex(f) ? f : palette[f] || '#000000');
    function farbenMalen() {
      const palette = Leinwand.TINTE[fl()];
      leiste.querySelectorAll('[data-farbe] .farbpunkt').forEach(p => { p.style.setProperty('--farbe', hexVon(p.parentElement.dataset.farbe, palette)); });
      leiste.querySelectorAll('[data-textfarbe] .farbpunkt').forEach(p => { p.style.setProperty('--farbe', hexVon(p.parentElement.dataset.textfarbe, palette)); });
    }

    // Eigene Farben hinter den Grundfarben; Rechtsklick (oder lange drücken) entfernt eine wieder
    let eigeneStand = '';
    function eigeneMalen() {
      const stand = e.eigeneFarben.join() + '|' + e.eigeneMarker.join();
      if (stand === eigeneStand) return;
      eigeneStand = stand;
      const knopf = (art, c) => `<button class="wz" type="button" ${art === 'marker' ? 'data-markerfarbe' : art === 'text' ? 'data-textfarbe' : 'data-farbe'}="${c}" data-eigen="${art}" title="Eigene Farbe ${c} (Rechtsklick entfernt sie)" aria-label="Eigene Farbe ${c}"><span class="farbpunkt${art === 'marker' ? ' marker' : ''}" style="--farbe: ${c}"></span></button>`;
      leiste.querySelector('[data-eigene="stift"]').innerHTML = e.eigeneFarben.map(c => knopf('stift', c)).join('');
      leiste.querySelector('[data-eigene="marker"]').innerHTML = e.eigeneMarker.map(c => knopf('marker', c)).join('');
      leiste.querySelector('[data-eigene="text"]').innerHTML = e.eigeneFarben.map(c => knopf('text', c)).join('');
    }

    function aktualisiere() {
      eigeneMalen();
      leiste.querySelectorAll('[data-werkzeug]').forEach(k => k.setAttribute('aria-pressed', String(k.dataset.werkzeug === e.werkzeug)));
      leiste.querySelectorAll('[data-farbe]').forEach(k => k.setAttribute('aria-pressed', String(k.dataset.farbe === e.farbe)));
      leiste.querySelectorAll('[data-markerfarbe]').forEach(k => k.setAttribute('aria-pressed', String(k.dataset.markerfarbe === e.markerFarbe)));
      leiste.querySelectorAll('[data-textfarbe]').forEach(k => k.setAttribute('aria-pressed', String(k.dataset.textfarbe === e.textFarbe)));
      leiste.querySelectorAll('[data-laserfarbe]').forEach(k => k.setAttribute('aria-pressed', String(k.dataset.laserfarbe === String(e.laserFarbe).toLowerCase())));
      regler();
      leiste.querySelectorAll('[data-radiermodus]').forEach(k => k.setAttribute('aria-pressed', String(k.dataset.radiermodus === e.radiermodus)));
      leiste.querySelectorAll('[data-notizfarbe]').forEach(k => k.setAttribute('aria-pressed', String(k.dataset.notizfarbe === e.notizFarbe)));
      const art = Leinwand.STIFTARTEN[e.stiftArt] ? e.stiftArt : 'fueller';
      leiste.querySelectorAll('[data-stiftart]').forEach(k => { const an = k.dataset.stiftart === art; k.setAttribute('aria-pressed', String(an)); k.setAttribute('aria-checked', String(an)); });
      leiste.querySelectorAll('[data-nur]').forEach(g => { g.hidden = g.dataset.nur !== e.werkzeug; });
      // Beim Textmarker seine Farben, sonst die Stiftfarben
      leiste.querySelectorAll('[data-farben]').forEach(g => { g.hidden = g.dataset.farben === 'marker' ? e.werkzeug !== 'marker' : ['marker', 'laser', 'text'].includes(e.werkzeug); });
      leiste.querySelector('[data-aktion="finger"]').setAttribute('aria-pressed', String(!!e.finger));
      leiste.querySelector('[data-aktion="undo"]').disabled = !lw.kannRueckgaengig();
      leiste.querySelector('[data-aktion="redo"]').disabled = !lw.kannWiederholen();
      leiste.querySelector('[data-plus="stift"]').value = hexVon(e.farbe, Leinwand.TINTE[fl()]);
      leiste.querySelector('[data-plus="marker"]').value = hexVon(e.markerFarbe, Leinwand.MARKER);
      leiste.querySelector('[data-plus="laser"]').value = istHex(e.laserFarbe) ? e.laserFarbe : STANDARD.laserFarbe;
      leiste.querySelector('[data-plus="text"]').value = hexVon(e.textFarbe, Leinwand.TINTE[fl()]);
      // Farben für die gestalteten Symbole: Spitze des Stifts, Textmarker
      leiste.style.setProperty('--wz-tinte', hexVon(e.farbe, Leinwand.TINTE[fl()]));
      leiste.style.setProperty('--wz-marker', hexVon(e.markerFarbe, Leinwand.MARKER));
      panelWerte();
      if (palette) fuellePalette();
    }

    // Drei Grössen und ein Regler; was sie einstellen, hängt vom Werkzeug ab (Stift, Textmarker, Radierer je für sich)
    function reglerArt() { return ['marker', 'radierer', 'laser', 'text'].includes(e.werkzeug) ? e.werkzeug : 'stift'; }
    function regler() {
      const art = reglerArt(), g = GROESSE[art];
      const name = e.preset[art], werte = e.presets[art];
      const wert = werte[name];
      const inp = leiste.querySelector('[data-regler]');
      inp.min = g.min; inp.max = g.max; inp.step = g.step;
      if (document.activeElement !== inp || inp.dataset.art !== art) inp.value = wert;
      inp.dataset.art = art;
      inp.title = g.titel + ' (für die gewählte Grösse)';
      inp.setAttribute('aria-label', `${g.titel}, ${PRESET_NAMEN[name]}`);
      inp.style.setProperty('--anteil', ((wert - g.min) / (g.max - g.min) * 100) + '%');
      const farbe = art === 'marker' ? hexVon(e.markerFarbe, Leinwand.MARKER) : art === 'laser' ? e.laserFarbe : art === 'text' ? hexVon(e.textFarbe, Leinwand.TINTE[fl()]) : hexVon(e.farbe, Leinwand.TINTE[fl()]);
      const masz = g.einheit || 'mm';
      const gruppe = leiste.querySelector('.presets');
      gruppe.dataset.art = art;
      leiste.querySelectorAll('[data-preset]').forEach(k => {
        const n = k.dataset.preset, v = werte[n];
        k.setAttribute('aria-checked', String(n === name));
        k.querySelector('.preset-wert').textContent = zahl(v) + ' ' + masz;
        const punkt = k.querySelector('.preset-punkt');
        punkt.style.setProperty('--g', Math.max(3, Math.min(24, g.px(v))) + 'px');
        punkt.style.setProperty('--farbe', farbe);
      });
      leiste.querySelector('.dicke-wert').textContent = art === 'radierer' && e.radiermodus === 'strich' ? '' : zahl(wert) + ' ' + masz;
    }

    const zoom = s => { leiste.querySelector('[data-aktion="zoom"]').textContent = Math.round(s * 100) + ' %'; };

    leiste.addEventListener('click', ev => {
      const k = ev.target.closest('button');
      if (!k) return;
      if (k.dataset.werkzeug) {
        const vorher = e.werkzeug;
        lw.setzeWerkzeug(k.dataset.werkzeug);
        // Vollbild: Stift, Marker, Radierer und Notiz klappen ihre Farben und Grössen auf (nochmal tippen schliesst sie)
        if (document.documentElement.classList.contains('vollbild')) {
          const hat = ['stift', 'marker', 'radierer', 'notiz', 'laser', 'text'].includes(k.dataset.werkzeug);
          const auf = hat && (vorher === k.dataset.werkzeug ? !leiste.classList.contains('eig-offen') : true);
          leiste.classList.toggle('eig-offen', auf);
        }
      }
      else if (k.dataset.preset) {
        lw.waehleGroesse(k.dataset.preset);
        // Mit Auswahl (Lasso) gilt die Grösse gleich für die ausgewählten Striche
        if (e.werkzeug === 'lasso') lw.setzeDicke(e[GROESSE.stift.k], true);
      }
      else if (k.dataset.farbe) lw.setzeFarbe(k.dataset.farbe);
      else if (k.dataset.markerfarbe) lw.setzeMarkerFarbe(k.dataset.markerfarbe);
      else if (k.dataset.laserfarbe) lw.setzeLaserFarbe(k.dataset.laserfarbe);
      else if (k.dataset.textfarbe) lw.setzeTextFarbe(k.dataset.textfarbe);
      else if (k.dataset.radiermodus) lw.setzeRadiermodus(k.dataset.radiermodus);
      else if (k.dataset.stiftart) lw.setzeStiftArt(k.dataset.stiftart);
      else if (k.dataset.notizfarbe) lw.setzeNotizFarbe(k.dataset.notizfarbe);
      else if (k.dataset.aktion === 'finger') lw.setzeFinger(!e.finger);
      else if (k.dataset.aktion === 'eigenschaften') {
        const auf = !leiste.classList.contains('eig-offen');
        leiste.classList.toggle('eig-offen', auf);
        k.setAttribute('aria-pressed', String(auf));
      }
      else if (k.dataset.aktion === 'links') lw.dreheSeite(-90);
      else if (k.dataset.aktion === 'rechts') lw.dreheSeite(90);
      else if (k.dataset.aktion === 'undo') lw.rueckgaengig();
      else if (k.dataset.aktion === 'redo') lw.wiederholen();
      else if (k.dataset.aktion === 'zoom') lw.einpassen();
      else if (k.dataset.aktion === 'tasten') {
        panel.hidden = !panel.hidden;
        k.setAttribute('aria-pressed', String(!panel.hidden));
        if (!panel.hidden) zeichneKurve();
      }
      aktualisiere();
    });

    // Regler: beim Ziehen nur die Einstellung, beim Loslassen auch die Auswahl (ein Schritt im Verlauf)
    leiste.addEventListener('input', ev => {
      if (ev.target.matches('[data-regler]')) lw.setzeDicke(Number(ev.target.value), false);
    });
    // "+": eine weitere Farbe aus dem Farbwähler übernehmen
    leiste.addEventListener('change', ev => {
      if (ev.target.matches('[data-regler]')) { lw.setzeDicke(Number(ev.target.value), true); return; }
      const art = ev.target.dataset.plus;
      if (!art || !istHex(ev.target.value)) return;
      const c = ev.target.value.toLowerCase();
      if (art === 'laser') { lw.setzeLaserFarbe(c); aktualisiere(); return; }
      const liste = art === 'marker' ? e.eigeneMarker : e.eigeneFarben;
      const grund = art === 'marker' ? Leinwand.MARKER : Leinwand.TINTE[fl()];
      lw.halteTextFokus && lw.halteTextFokus();
      if (!Object.values(grund).includes(c)) {
        const i = liste.indexOf(c);
        if (i >= 0) liste.splice(i, 1);
        liste.push(c);
        while (liste.length > MAX_EIGENE) liste.shift();
      }
      if (art === 'marker') lw.setzeMarkerFarbe(c); else if (art === 'text') lw.setzeTextFarbe(c); else lw.setzeFarbe(c);
      aktualisiere();
    });
    // Während ein Text geschrieben wird: Farbe und Grösse wählen, ohne dass das Textfeld den Fokus (und auf dem iPad
    // die Tastatur) verliert
    leiste.addEventListener('pointerdown', ev => {
      if (!lw.textBearbeitung || !lw.textBearbeitung()) return;
      const k = ev.target.closest('[data-textfarbe], [data-preset], [data-regler], [data-plus], .farbreihe, .groesse-gruppe');
      if (!k) return;
      lw.halteTextFokus();
      if (!ev.target.closest('input')) ev.preventDefault();
    }, true);
    lw.on('text', aktualisiere);
    leiste.addEventListener('contextmenu', ev => {
      const k = ev.target.closest('[data-eigen]');
      if (!k) return;
      ev.preventDefault();
      const art = k.dataset.eigen;
      const c = art === 'marker' ? k.dataset.markerfarbe : art === 'text' ? k.dataset.textfarbe : k.dataset.farbe;
      const liste = art === 'marker' ? e.eigeneMarker : e.eigeneFarben;
      const i = liste.indexOf(c);
      if (i >= 0) liste.splice(i, 1);
      if (art === 'marker' && e.markerFarbe === c) e.markerFarbe = 'gelb';
      if (art !== 'marker' && e.farbe === c) e.farbe = 'tinte';
      if (art !== 'marker' && e.textFarbe === c) e.textFarbe = 'tinte';
      speichereEinst();
      if (window.UI) UI.meldung('Eigene Farbe entfernt');
    });

    /* ----- Stift-Panel: Einstellungen, Diagnose, Druckkurve ----- */

    const WERT_TEXT = {
      druckKurve: v => zahl(Number(v).toFixed(2)), druckMin: v => Math.round(v * 100) + ' %', druckMax: v => Math.round(v * 100) + ' %',
      neigungAb: v => Math.round(v) + '°'
    };
    function panelWerte() {
      panel.querySelector('[data-t="seite"]').value = e.seite;
      panel.querySelector('[data-t="radier"]').value = e.radier;
      const eigen = e.druckModus === 'eigen';
      panel.querySelector('[data-t="druckModus"]').value = eigen ? 'eigen' : 'pencil';
      panel.querySelector('.diag-pencil').hidden = eigen;
      panel.querySelector('.diag-eigen').hidden = !eigen;
      panel.querySelector('[data-w="druckTypisch"]').textContent = e.druckTypisch ? Math.round(e.druckTypisch * 100) + ' %' : 'noch nicht gelernt (40 %)';
      for (const k of ['druck', 'neigung', 'finger']) panel.querySelector(`[data-t="${k}"]`).checked = !!e[k];
      for (const k of Object.keys(WERT_TEXT)) {
        const r = panel.querySelector(`[data-t="${k}"]`);
        if (!r) continue;
        if (document.activeElement !== r) r.value = e[k];
        panel.querySelector(`[data-w="${k}"]`).textContent = WERT_TEXT[k](e[k]);
      }
    }
    const d = n => panel.querySelector(`[data-d="${n}"]`);
    const kurve = panel.querySelector('.diag-kurve');
    const feld = panel.querySelector('.diag-feld');
    const cs = () => getComputedStyle(document.documentElement);
    let letzterRoh = null;

    // Die Kurve vom gemeldeten zum verwendeten Druck, dazu der aktuelle Wert als Punkt
    function zeichneKurve() {
      if (panel.hidden) return;
      const c = kurve.getContext('2d'), W = kurve.width, H = kurve.height, r = 6;
      const farbe = cs().getPropertyValue('--fueller').trim() || '#2350c4', linie = cs().getPropertyValue('--linie').trim() || '#ccc', grau = cs().getPropertyValue('--grau').trim() || '#888';
      c.clearRect(0, 0, W, H);
      c.strokeStyle = linie; c.lineWidth = 1;
      c.strokeRect(r + 0.5, r + 0.5, W - 2 * r - 1, H - 2 * r - 1);
      c.strokeStyle = farbe; c.lineWidth = 2; c.beginPath();
      for (let i = 0; i <= 100; i++) {
        const x = i / 100, y = x === 0 ? 0 : Leinwand.druckAbbildung(x, e);
        const px = r + x * (W - 2 * r), py = H - r - y * (H - 2 * r);
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.stroke();
      c.fillStyle = grau; c.font = '11px system-ui, sans-serif';
      c.fillText('gemeldeter Druck →', r + 4, H - r - 4);
      if (letzterRoh != null) {
        const y = Leinwand.druckAbbildung(letzterRoh, e);
        c.fillStyle = farbe;
        c.beginPath(); c.arc(r + letzterRoh * (W - 2 * r), H - r - y * (H - 2 * r), 4, 0, Math.PI * 2); c.fill();
      }
    }

    let stummeProben = 0, stummeSumme = 0, pen0 = 0;
    const TYPEN = { pen: 'Stift', mouse: 'Maus', touch: 'Finger' };
    function zeigeDiag(p) {
      d('typ').textContent = TYPEN[p.typ] || p.typ || '–';
      const roh = p.roh != null ? p.roh : p.druck;
      const beruehrt = (p.tasten & 1) || roh > 0;
      d('druck').textContent = p.typ === 'pen' ? `${roh.toFixed(3)} → ${Leinwand.druckAbbildung(roh, e).toFixed(2)}` : `${roh.toFixed(2)} (feste Grösse)`;
      d('druckbalken').style.width = Math.round(roh * 100) + '%';
      d('neigung').textContent = `X ${p.tiltX}° · Y ${p.tiltY}° · gesamt ${p.neigung}°`;
      d('twist').textContent = p.twist + '°';
      d('tasten').textContent = p.tasten ? `Wert ${p.tasten}${p.tasten & 32 ? ' (Radiertaste)' : ''}${p.tasten & 2 ? ' (Seitentaste)' : ''}` : 'keine';
      if (beruehrt) letzterRoh = roh;
      // Meldet der Stift beim Schreiben immer genau 0,5 und keine Neigung, kommt kein echter Druck an
      if (p.typ === 'pen' && beruehrt) { stummeProben++; if (roh === 0.5 && !p.tiltX && !p.tiltY) stummeSumme++; }
      let hinweis = '';
      if (p.typ === 'mouse') hinweis = 'Es wird eine Maus erkannt, kein Stift: Druck und Neigung gibt es dann nicht, die Strichstärke bleibt fest.';
      else if (p.typ === 'touch') hinweis = 'Es wird ein Finger erkannt, kein Stift.';
      else if (stummeProben >= 12 && stummeSumme === stummeProben) hinweis = 'Der Stift meldet immer Druck 0,5 und keine Neigung. Das sieht nach einem Treiber ohne Stiftdaten aus: in den Windows-Einstellungen unter „Stift und Windows Ink“ und im Treiber des Geräts nachsehen.';
      else if (p.typ === 'pen' && stummeProben >= 12) hinweis = 'Der Stift meldet Druck: alles in Ordnung.';
      d('hinweis').textContent = hinweis;
      zeichneKurve();
    }
    lw.on('stiftdaten', zeigeDiag);

    // Testfeld: eigene kleine Zeichenfläche, ohne Wirkung auf das Dokument
    let feldStrich = null, messen = false, messMax = 0;
    function feldLinie(ev, von) {
      const c = feld.getContext('2d'), r = feld.getBoundingClientRect();
      const x = (ev.clientX - r.left) * feld.width / r.width, y = (ev.clientY - r.top) * feld.height / r.height;
      if (ev.pointerType === 'pen' && ev.pressure > 0) feldStrich.roh = ev.pressure;
      const pen = ev.pointerType === 'pen' && e.druck;
      const druck = pen ? Leinwand.druckAbbildung(feldStrich.roh, e) : 0.5;
      const neig = pen && e.neigung === true ? Math.max(0, Math.min(1, (Leinwand.neigungWinkel(ev) - e.neigungAb) / (80 - e.neigungAb))) : 0;
      c.lineCap = 'round';
      c.strokeStyle = cs().getPropertyValue('--tinte').trim() || '#000';
      c.globalAlpha = Leinwand.neigungAlpha(neig);
      c.lineWidth = Leinwand.breite({ w: 'stift', d: 2.2 }, druck, neig);
      if (von) { c.beginPath(); c.moveTo(von[0], von[1]); c.lineTo(x, y); c.stroke(); }
      c.globalAlpha = 1;
      return [x, y];
    }
    feld.addEventListener('pointerdown', ev => {
      ev.preventDefault(); ev.stopPropagation();
      feld.setPointerCapture(ev.pointerId);
      feldStrich = { roh: ev.pressure > 0 ? ev.pressure : 0.5, max: 0 };
      feldStrich.letzter = feldLinie(ev, null);
      zeigeDiag({ ...Leinwand.stiftDaten(ev), roh: ev.pressure });
    });
    feld.addEventListener('pointermove', ev => {
      zeigeDiag({ ...Leinwand.stiftDaten(ev), roh: ev.pressure });
      if (!feldStrich) return;
      for (const q of ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]) {
        feldStrich.max = Math.max(feldStrich.max, q.pressure || 0);
        feldStrich.letzter = feldLinie(q, feldStrich.letzter);
      }
    });
    const feldEnde = () => {
      if (!feldStrich) return;
      const max = feldStrich.max;
      feldStrich = null;
      // Abwarten, dann das Feld leeren, damit man neu ansetzen kann
      clearTimeout(feld._t);
      feld._t = setTimeout(() => feld.getContext('2d').clearRect(0, 0, feld.width, feld.height), 4000);
      if (messen && max > 0) {
        messen = false;
        e.druckMax = Math.max(0.4, Math.min(1, Math.round(max * 95) / 100));
        speichereEinst();
        if (window.UI) UI.meldung(`Maximaldruck auf ${Math.round(e.druckMax * 100)} % gesetzt (höchster Druck: ${Math.round(max * 100)} %)`);
        panel.querySelector('[data-aktion="messen"]').textContent = 'Maximaldruck messen';
      }
    };
    feld.addEventListener('pointerup', feldEnde);
    feld.addEventListener('pointercancel', feldEnde);

    panel.addEventListener('click', ev => {
      const k = ev.target.closest('[data-aktion]');
      if (!k) return;
      if (k.dataset.aktion === 'messen') {
        messen = !messen;
        k.textContent = messen ? 'Jetzt im Feld so fest drücken wie möglich …' : 'Maximaldruck messen';
      } else if (k.dataset.aktion === 'druck-neu') {
        delete e.druckTypisch;
        speichereEinst();
        if (window.UI) UI.meldung('Der gewohnte Druck wird beim nächsten Schreiben neu gelernt');
      } else if (k.dataset.aktion === 'alle-einst') {
        if (window.Einstellungen) Einstellungen.zeige('schreiben');
      } else if (k.dataset.aktion === 'kurve-null') {
        Object.assign(e, { druckKurve: 1, druckMin: 0, druckMax: 1, neigungAb: 30 });
        speichereEinst();
      }
    });
    panel.addEventListener('input', ev => {
      const t = ev.target.dataset.t;
      if (ev.target.type !== 'range' || !t) return;
      e[t] = Number(ev.target.value);
      panel.querySelector(`[data-w="${t}"]`).textContent = WERT_TEXT[t](e[t]);
      zeichneKurve();
    });
    panel.addEventListener('change', ev => {
      const t = ev.target.dataset.t;
      if (['druck', 'neigung', 'finger'].includes(t)) e[t] = ev.target.checked;
      else if (ev.target.type === 'range' && t) e[t] = Number(ev.target.value);
      else if (t) e[t] = ev.target.value;
      speichereEinst();
      if (t === 'druckModus') zeichneKurve();
    });
    panel.addEventListener('pointerdown', ev => ev.stopPropagation());

    lw.on('werkzeug', aktualisiere);
    // Im Vollbild verschwinden Farben und Grössen, sobald man zu schreiben anfängt
    lw.on('schreibstart', () => { if (leiste.classList.contains('eig-offen') && document.documentElement.classList.contains('vollbild')) leiste.classList.remove('eig-offen'); });

    /* ----- Symbole per Ziehen umsortieren (Maus, Stift, Finger); die Reihenfolge bleibt auf dem Gerät gespeichert ----- */
    const REIHEN_KEY = 'lokal:leiste-reihenfolge';
    const ordGruppen = () => [...leiste.querySelectorAll(':scope > .gruppe')].filter(g => g.querySelector('[data-ord]'));
    const aktuelleOrdnung = () => ordGruppen().map(g => [...g.querySelectorAll('[data-ord]')].map(b => b.dataset.ord));
    const standardOrdnung = aktuelleOrdnung();
    function wendeOrdnungAn(o) {
      const gr = ordGruppen();
      const alle = new Map([...leiste.querySelectorAll('[data-ord]')].map(b => [b.dataset.ord, b]));
      if (!Array.isArray(o) || o.length !== gr.length || !o.every(Array.isArray)) return;
      const flach = o.flat();
      // Gespeichert darf nur Bekanntes und nichts doppelt sein; neue Symbole (z. B. der Laserpointer in einer neueren
      // Version) fehlen in alten Reihenfolgen und kommen ans Ende ihrer Gruppe, die eigene Reihenfolge bleibt erhalten
      if (new Set(flach).size !== flach.length || !flach.every(k => alle.has(k))) return;
      o.forEach((keys, i) => keys.forEach(k => gr[i].appendChild(alle.get(k))));
      for (const [k, b] of alle) if (!flach.includes(k)) b.parentNode.appendChild(b);
    }
    wendeOrdnungAn(Daten.get(REIHEN_KEY, null));
    let ziehen = null, klickWeg = false;
    leiste.addEventListener('pointerdown', ev => {
      const b = ev.target.closest('[data-ord]');
      if (!b || ev.button > 0) return;
      ziehen = { b, id: ev.pointerId, x: ev.clientX, y: ev.clientY, aktiv: false };
    });
    leiste.addEventListener('pointermove', ev => {
      if (!ziehen || ev.pointerId !== ziehen.id) return;
      if (!ziehen.aktiv) {
        if (Math.hypot(ev.clientX - ziehen.x, ev.clientY - ziehen.y) < 10) return;
        ziehen.aktiv = true;
        try { ziehen.b.setPointerCapture(ev.pointerId); } catch (err) { /* geht auch ohne */ }
        ziehen.b.classList.add('zieht');
        leiste.classList.add('ordnet');
      }
      const t = (document.elementFromPoint(ev.clientX, ev.clientY) || document.body).closest('[data-ord]');
      if (!t || t === ziehen.b || !leiste.contains(t)) return;
      const r = t.getBoundingClientRect();
      t.parentNode.insertBefore(ziehen.b, ev.clientX > r.left + r.width / 2 ? t.nextSibling : t);
    });
    const ziehenEnde = () => {
      if (!ziehen) return;
      const z = ziehen;
      ziehen = null;
      if (!z.aktiv) return;
      z.b.classList.remove('zieht');
      leiste.classList.remove('ordnet');
      Daten.set(REIHEN_KEY, aktuelleOrdnung());
      klickWeg = true;                       // das Loslassen darf nichts auslösen
      setTimeout(() => { klickWeg = false; }, 0);
    };
    leiste.addEventListener('pointerup', ziehenEnde);
    leiste.addEventListener('pointercancel', ziehenEnde);
    leiste.addEventListener('click', ev => { if (klickWeg) { ev.stopPropagation(); ev.preventDefault(); } }, true);
    // Werkzeugleiste anpassen: was nicht gebraucht wird, verschwindet (je Gerät). Drehen gibt es nur für Seiten.
    function sichtbarkeit() {
      let aus = Daten.get(AUS_KEY, []);
      if (!Array.isArray(aus)) aus = [];
      leiste.querySelectorAll('[data-ord], [data-sicht]').forEach(b => {
        const k = b.dataset.ord || b.dataset.sicht;
        b.hidden = aus.includes(k) || (b.hasAttribute('data-nur-drehen') && !(lw.kannDrehen && lw.kannDrehen()));
      });
      leiste.classList.toggle('farbig', Daten.get(FARBIG_KEY, true) !== false);
    }
    async function anpassen() {
      let aus = Daten.get(AUS_KEY, []);
      if (!Array.isArray(aus)) aus = [];
      const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
      // Jeder Eintrag mit seinem Symbol aus der Leiste (gestaltet oder als Linie, je nach "Farbige Symbole")
      const farbig = Daten.get(FARBIG_KEY, true) !== false;
      const farben = `--wz-tinte: ${hexVon(e.farbe, Leinwand.TINTE[fl()])}; --wz-marker: ${hexVon(e.markerFarbe, Leinwand.MARKER)}`;
      const ergebnis = await UI.oeffneDialog(`<form class="dialog-form">
          <h2>Werkzeugleiste anpassen</h2>
          <p class="dialog-klein">Was du nicht brauchst, nimm weg. Die Reihenfolge änderst du direkt in der Leiste: ein Symbol gedrückt halten und ziehen.</p>
          <div class="leiste-wahl${farbig ? ' farbig' : ''}" style="${farben}">${LEISTE_TEILE.map(([k, n]) => `<label class="haken-label"><input type="checkbox" name="teil" value="${esc(k)}" ${aus.includes(k) ? '' : 'checked'}><span class="wahl-symbol">${icon(k.slice(2))}</span>${esc(n)}</label>`).join('')}</div>
          <label class="haken-label"><input type="checkbox" name="farbig" ${Daten.get(FARBIG_KEY, true) !== false ? 'checked' : ''}> Farbige Symbole</label>
          <div class="dialog-knoepfe"><button type="button" class="btn-leise" data-wahl="alle">Alle zeigen</button><button type="button" class="btn-leise" data-abbrechen>Abbrechen</button><button type="submit" class="btn-primaer">Übernehmen</button></div>
        </form>`, { wert: d => ({ an: [...d.querySelectorAll('[name="teil"]')].filter(x => x.checked).map(x => x.value), farbig: d.querySelector('[name="farbig"]').checked }) });
      if (!ergebnis) return;
      if (ergebnis === 'alle') { Daten.set(AUS_KEY, []); Daten.set(FARBIG_KEY, true); }
      else {
        Daten.set(AUS_KEY, LEISTE_TEILE.map(([k]) => k).filter(k => !ergebnis.an.includes(k)));
        Daten.set(FARBIG_KEY, ergebnis.farbig);
      }
      leisten.forEach(l => l.sichtbarkeit());
    }
    // Gesten stehen in den Einstellungen (Reiter "Gesten")
    function oeffneGesten() { if (window.Einstellungen) Einstellungen.zeige('gesten'); }

    /* ----- Palette am Stift: Werkzeuge, Rückgängig, Stiftart, Farben und Grössen dort, wo man schreibt ----- */
    // Öffnet sich mit einer Geste (Standard: Apple Pencil Pro zusammendrücken, in der iPad-App) an der Stelle, über der
    // der Stift schwebt; sonst in der Mitte. Antippen wählt, daneben tippen oder einfach weiterschreiben schliesst sie.
    let palette = null;
    const PAL_WERKZEUGE = ['stift', 'marker', 'radierer', 'lasso', 'text', 'hand'];
    function fuellePalette() {
      const w = e.werkzeug, art = reglerArt(), g = GROESSE[art], masz = g.einheit || 'mm';
      const tinte = Leinwand.TINTE[fl()];
      const farben = w === 'marker'
        ? Object.entries(Leinwand.MARKER).map(([f, c]) => [f, c, e.markerFarbe === f]).concat(e.eigeneMarker.map(c => [c, c, e.markerFarbe === c]))
        : w === 'text'
          ? Object.keys(Leinwand.TINTE.hell).map(f => [f, tinte[f], e.textFarbe === f]).concat(e.eigeneFarben.map(c => [c, c, e.textFarbe === c]))
          : Object.keys(Leinwand.TINTE.hell).map(f => [f, tinte[f], e.farbe === f]).concat(e.eigeneFarben.map(c => [c, c, e.farbe === c]));
      const mitFarbe = ['stift', 'marker', 'text', 'lasso'].includes(w), mitGroesse = ['stift', 'marker', 'radierer', 'text', 'lasso'].includes(w);
      const stiftart = Leinwand.STIFTARTEN[e.stiftArt] ? e.stiftArt : 'fueller';
      const punktFarbe = art === 'marker' ? hexVon(e.markerFarbe, Leinwand.MARKER) : art === 'text' ? hexVon(e.textFarbe, tinte) : hexVon(e.farbe, tinte);
      palette.innerHTML = `
        <div class="pal-reihe">
          ${PAL_WERKZEUGE.map(x => `<button class="wz" type="button" data-pw="${x}" aria-pressed="${x === w}" aria-label="${(WERKZEUGE.find(z => z[0] === x) || [x, x])[1]}">${icon(x)}</button>`).join('')}
          <span class="pal-trenner" aria-hidden="true"></span>
          <button class="wz" type="button" data-pa="undo" aria-label="Rückgängig" ${lw.kannRueckgaengig() ? '' : 'disabled'}>${icon('undo')}</button>
          <button class="wz" type="button" data-pa="redo" aria-label="Wiederholen" ${lw.kannWiederholen() ? '' : 'disabled'}>${icon('redo')}</button>
        </div>
        ${w === 'stift' ? `<div class="pal-reihe pal-arten" role="radiogroup" aria-label="Stiftart">${Object.entries(Leinwand.STIFTARTEN).map(([a, n]) => `<button class="wz wz-text" type="button" role="radio" data-part="${a}" aria-checked="${a === stiftart}" aria-pressed="${a === stiftart}">${icon(a)}<span>${n}</span></button>`).join('')}</div>` : ''}
        ${mitFarbe ? `<div class="pal-reihe pal-farben" role="group" aria-label="Farbe">${farben.map(([f, c, an]) => `<button class="wz" type="button" data-pf="${f}" aria-pressed="${an}" aria-label="Farbe ${Leinwand.FARBNAMEN[f] || Leinwand.MARKERNAMEN[f] || f}"><span class="farbpunkt${w === 'marker' ? ' marker' : ''}" style="--farbe: ${c}"></span></button>`).join('')}</div>` : ''}
        ${mitGroesse ? `<div class="pal-reihe pal-groessen" role="radiogroup" aria-label="Grösse">${Object.keys(PRESET_NAMEN).map(n => `<button class="preset" type="button" role="radio" data-pg="${n}" aria-checked="${e.preset[art] === n}"><span class="preset-punkt" style="--g: ${Math.max(3, Math.min(22, g.px(e.presets[art][n])))}px; --farbe: ${punktFarbe}" aria-hidden="true"></span><span class="preset-wert">${zahl(e.presets[art][n])} ${masz}</span></button>`).join('')}</div>` : ''}`;
      palette.dataset.art = art;
    }
    function legePalette(pos) {
      const host = lw.el, hb = host.clientWidth, hh = host.clientHeight, b = palette.offsetWidth, h = palette.offsetHeight;
      const x = Math.max(8, Math.min(hb - b - 8, pos[0] - b / 2));
      // Über der Stiftspitze, damit die Hand sie nicht verdeckt; ist dort kein Platz, darunter
      let y = pos[1] - h - 28;
      if (y < 8) y = Math.min(hh - h - 8, pos[1] + 36);
      palette.style.left = x + 'px';
      palette.style.top = Math.max(8, y) + 'px';
    }
    const ausserhalbPalette = ev => { if (palette && !palette.contains(ev.target)) schliessePalette(); };
    function schliessePalette() {
      if (!palette) return;
      palette.remove();
      palette = null;
      document.removeEventListener('pointerdown', ausserhalbPalette, true);
    }
    function zeigePalette(pos) {
      if (palette) { schliessePalette(); return; }
      if (!lw.el) return;
      palette = document.createElement('div');
      palette.className = 'lw-palette';
      palette.setAttribute('role', 'dialog');
      palette.setAttribute('aria-label', 'Palette: Werkzeuge, Farben und Grössen');
      fuellePalette();
      lw.el.appendChild(palette);
      const ort = pos || [lw.el.clientWidth / 2, lw.el.clientHeight / 2];
      palette._ort = ort;
      legePalette(ort);
      palette.addEventListener('pointerdown', ev => ev.stopPropagation());
      palette.addEventListener('click', ev => {
        const k = ev.target.closest('button');
        if (!k || k.disabled) return;
        const d = k.dataset;
        if (d.pw) lw.setzeWerkzeug(d.pw);
        else if (d.pa === 'undo') lw.rueckgaengig();
        else if (d.pa === 'redo') lw.wiederholen();
        else if (d.part) lw.setzeStiftArt(d.part);
        else if (d.pf) { if (e.werkzeug === 'marker') lw.setzeMarkerFarbe(d.pf); else if (e.werkzeug === 'text') lw.setzeTextFarbe(d.pf); else lw.setzeFarbe(d.pf); }
        else if (d.pg) { lw.waehleGroesse(d.pg); if (e.werkzeug === 'lasso') lw.setzeDicke(e[GROESSE.stift.k], true); }
        aktualisiere();
        // Der Inhalt hängt vom Werkzeug ab: an derselben Stelle neu ausrichten
        if (palette) legePalette(palette._ort);
      });
      setTimeout(() => document.addEventListener('pointerdown', ausserhalbPalette, true), 0);
    }
    function zeigeEigenschaften() {
      const auf = !leiste.classList.contains('eig-offen');
      leiste.classList.toggle('eig-offen', auf);
      leiste.querySelector('[data-aktion="eigenschaften"]').setAttribute('aria-pressed', String(auf));
    }
    lw.on('verlauf', aktualisiere);
    lw.on('ansicht', zoom);
    lw.on('stifttaste', text => { panel.querySelector('.tasten-test').textContent = text; });
    const themaBeobachter = new MutationObserver(() => { farbenMalen(); aktualisiere(); zeichneKurve(); });
    themaBeobachter.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    farbenMalen();
    sichtbarkeit();
    aktualisiere();
    zoom(lw.ansicht().s);

    const eintrag = {
      aktualisiere,
      sichtbarkeit,
      anpassen,
      oeffneGesten,
      zeigeEigenschaften,
      zeigePalette,
      schliessePalette,
      anfang: leiste.querySelector('[data-anfang]'),
      ende: leiste.querySelector('[data-ende]'),
      schliesseEigenschaften: () => { leiste.classList.remove('eig-offen'); leiste.querySelector('[data-aktion="eigenschaften"]').setAttribute('aria-pressed', 'false'); },
      reihenfolgeZuruecksetzen: () => { wendeOrdnungAn(standardOrdnung); Daten.set(REIHEN_KEY, standardOrdnung); },
      tastenOffen: () => !panel.hidden,
      schliesseTasten: () => { panel.hidden = true; leiste.querySelector('[data-aktion="tasten"]').setAttribute('aria-pressed', 'false'); },
      zerstoere: () => { leisten.delete(eintrag); schliessePalette(); themaBeobachter.disconnect(); clearTimeout(feld._t); panel.remove(); leiste.innerHTML = ''; }
    };
    leisten.add(eintrag);
    return eintrag;
  }

  window.Werkzeuge = { baue, einstellungen, speichereEinst, GESTEN_LISTE, STIFTART_TITEL, symbol: icon, anpassen: () => { const l = [...leisten][0]; if (l) l.anpassen(); } };
})();
