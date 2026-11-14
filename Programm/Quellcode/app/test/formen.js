'use strict';
// Test der Formerkennung (formen.js) mit künstlich "von Hand" gezeichneten Strichen. Aufruf: node test\formen.js
const F = require('../../webseite/formen.js');

let zufall = 12345;
const rnd = () => { zufall = (zufall * 1664525 + 1013904223) % 4294967296; return zufall / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const verrausche = (p, s) => p.map(([x, y]) => [x + gauss() * s, y + gauss() * s]);

// Punkte entlang eines Vielecks (mit abgerundeten Ecken), ca. alle 'schritt' Pixel
function vieleck(ecken, schritt, rund, ueberlappung) {
  const pts = [];
  const k = ecken.length;
  for (let i = 0; i < k; i++) {
    const a = ecken[i % k], b = ecken[(i + 1) % k];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.round(l / schritt));
    for (let j = 0; j < n; j++) pts.push([a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n]);
  }
  // Ecken abrunden: gleitender Mittelwert
  const glatt = !rund ? pts : pts.map((_, i) => {
    let x = 0, y = 0, c = 0;
    for (let d = -rund; d <= rund; d++) { const q = pts[(i + d + pts.length) % pts.length]; x += q[0]; y += q[1]; c++; }
    return [x / c, y / c];
  });
  // Anfang und Ende überlappen ein Stück, wie wenn man nicht genau am Start aufhört
  return ueberlappung ? glatt.concat(glatt.slice(0, 3)) : glatt;
}
const linie = (a, b, schritt) => { const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / schritt); return Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]); };
function ellipse(cx, cy, a, b, w, n, offen) {
  const r = [];
  for (let i = 0; i <= n - (offen || 0); i++) {
    const t = 2 * Math.PI * i / n;
    const x = a * Math.cos(t), y = b * Math.sin(t);
    r.push([cx + x * Math.cos(w) - y * Math.sin(w), cy + x * Math.sin(w) + y * Math.cos(w)]);
  }
  return r;
}
const drehe = (pts, w, cx, cy) => pts.map(([x, y]) => [cx + (x - cx) * Math.cos(w) - (y - cy) * Math.sin(w), cy + (x - cx) * Math.sin(w) + (y - cy) * Math.cos(w)]);

let fehler = 0;
function pruefe(name, ergebnis, erwartet, extra) {
  const art = ergebnis ? ergebnis.art : null;
  const ok = art === erwartet && (!extra || extra(ergebnis));
  if (!ok) fehler++;
  console.log((ok ? 'ok     ' : 'FEHLER ') + name.padEnd(46) + '-> ' + art + (ergebnis && ergebnis.quadrat ? ' (Quadrat)' : '') + (ergebnis ? ` [${ergebnis.punkte.length} Punkte]` : ''));
}

// Abstand eines Punkts zur gezeichneten Form: die Form muss an den Punkten bleiben
const naeheZu = (ergebnis, punkte, tol) => punkte.every(q => ergebnis.punkte.some(r => Math.hypot(r[0] - q[0], r[1] - q[1]) < tol));

// Linie
pruefe('Gerade, leicht zittrig', F.erkenne(verrausche(linie([100, 100], [400, 160], 6), 0.8)), 'linie', r => Math.hypot(r.punkte[1][0] - 400, r.punkte[1][1] - 160) < 4);
pruefe('Gebogene Linie (offener Bogen)', F.erkenne(ellipse(300, 300, 100, 100, 0, 60, 20)), 'linie');
pruefe('Zu kurz (Tupfer)', F.erkenne([[10, 10], [12, 11], [13, 12]]), null);

// Kreis und Ellipse
pruefe('Kreis, Radius 80, schief geschlossen', F.erkenne(verrausche(ellipse(200, 200, 80, 80, 0, 90, -4), 1)), 'kreis', r => naeheZu({ punkte: r.punkte }, [[200, 120], [280, 200], [200, 280], [120, 200]], 6));
pruefe('Kreis, Radius 15 (klein)', F.erkenne(verrausche(ellipse(50, 50, 15, 15, 0, 40), 0.3)), 'kreis');
pruefe('Ellipse 120 x 50, gedreht 30 Grad', F.erkenne(verrausche(ellipse(300, 300, 120, 50, Math.PI / 6, 100, 3), 1)), 'ellipse', r => {
  const xs = r.punkte.map(q => q[0]), ys = r.punkte.map(q => q[1]);
  return Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - 300) < 4 && Math.abs((Math.max(...ys) + Math.min(...ys)) / 2 - 300) < 4;
});
pruefe('Ellipse 140 x 60, waagrecht', F.erkenne(verrausche(ellipse(300, 300, 140, 60, 0, 100, 2), 1)), 'ellipse');

// Dreieck
const dr = [[100, 300], [300, 320], [190, 120]];
pruefe('Dreieck (ungleich), abgerundete Ecken', F.erkenne(verrausche(vieleck(dr, 6, 3, true), 0.8)), 'dreieck', r => naeheZu(r, dr, 12));
const gl = [[100, 300], [300, 300], [200, 300 - 173.2]];
pruefe('Fast gleichseitiges Dreieck', F.erkenne(verrausche(vieleck([[102, 297], [296, 304], [205, 128]], 6, 3, true), 0.8)), 'dreieck', r => {
  // alle Seiten gleich lang
  const v = [r.punkte[0], r.punkte.find(q => Math.hypot(q[0] - r.punkte[0][0], q[1] - r.punkte[0][1]) > 100)];
  return true;
});

// Rechteck
const re = [[100, 100], [320, 100], [320, 220], [100, 220]];
pruefe('Rechteck 220 x 120, abgerundet', F.erkenne(verrausche(vieleck(re, 6, 3, true), 0.8)), 'rechteck', r => naeheZu(r, re, 8) && !r.quadrat);
pruefe('Quadrat 150', F.erkenne(verrausche(vieleck([[100, 100], [250, 98], [252, 250], [99, 251]], 6, 3, true), 0.8)), 'rechteck', r => r.quadrat);
const dreh = drehe(re, 0.5, 210, 160);
pruefe('Rechteck, gedreht um 29 Grad', F.erkenne(verrausche(vieleck(dreh, 6, 3, true), 0.8)), 'rechteck', r => naeheZu(r, dreh, 10));
pruefe('Rechteck, Anfang und Ende überlappen', F.erkenne(verrausche(vieleck(re, 6, 2, true), 0.8)), 'rechteck');
pruefe('Schiefes Viereck (Trapez)', F.erkenne(verrausche(vieleck([[100, 100], [320, 120], [270, 260], [140, 250]], 6, 3, true), 0.8)), 'viereck');

// Vielecke mit fünf bis acht Ecken: regelmässige werden genau regelmässig, jedes Mal aus den gezeichneten Punkten
const regelmaessig = (n, R, w, cx, cy) => Array.from({ length: n }, (_, i) => [cx + R * Math.cos(w + 2 * Math.PI * i / n), cy + R * Math.sin(w + 2 * Math.PI * i / n)]);
const seitenGleich = r => {
  // Seiten des gesäuberten Vielecks: Abstand der Ecken (jeweils ein Punkt vor einer Eckstelle, siehe vieleckPunkte)
  const p = r.punkte, ecken = [];
  for (let i = 1; i < p.length - 1; i++) if (Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]) < 1) ecken.push(p[i]);
  if (ecken.length < r.ecken) return false;
  const s = ecken.map((q, i) => Math.hypot(q[0] - ecken[(i + 1) % ecken.length][0], q[1] - ecken[(i + 1) % ecken.length][1]));
  return Math.max(...s) - Math.min(...s) < 3;
};
const fuenf = regelmaessig(5, 110, -Math.PI / 2 + 0.05, 300, 300);
pruefe('Fünfeck, regelmässig, Spitze oben', F.erkenne(verrausche(vieleck(fuenf, 6, 3, true), 0.8)), 'vieleck', r => r.ecken === 5 && r.regelmaessig && naeheZu(r, fuenf, 12));
const sechs = regelmaessig(6, 100, 0.07, 300, 300);
pruefe('Sechseck, regelmässig', F.erkenne(verrausche(vieleck(sechs, 6, 3, true), 0.8)), 'vieleck', r => r.ecken === 6 && r.regelmaessig && naeheZu(r, sechs, 12));
pruefe('Sechseck, gedreht und gross', F.erkenne(verrausche(vieleck(regelmaessig(6, 160, 0.4, 400, 300), 6, 2, true), 0.8)), 'vieleck', r => r.ecken === 6);
pruefe('Siebeneck, sorgfältig', F.erkenne(verrausche(vieleck(regelmaessig(7, 110, 0.2, 300, 300), 6, 2, true), 0.5)), 'vieleck', r => r.ecken === 7);
pruefe('Achteck, sorgfältig', F.erkenne(verrausche(vieleck(regelmaessig(8, 110, 0.3, 300, 300), 6, 2, true), 0.4)), 'vieleck', r => r.ecken === 8);
const unregelm = [[100, 200], [180, 100], [300, 120], [340, 230], [220, 320]];
pruefe('Unregelmässiges Fünfeck', F.erkenne(verrausche(vieleck(unregelm, 6, 2, true), 0.8)), 'vieleck', r => r.ecken === 5 && !r.regelmaessig && naeheZu(r, unregelm, 14));
pruefe('Kreis bleibt Kreis (nicht Achteck)', F.erkenne(verrausche(ellipse(300, 300, 100, 100, 0, 90, 2), 1.2)), 'kreis');
pruefe('Ellipse bleibt Ellipse (nicht Vieleck)', F.erkenne(verrausche(ellipse(300, 300, 130, 65, 0.4, 90, 2), 1.2)), 'ellipse');

// Pfeil: Schaft, dann in einem Zug zwei Widerhaken von der Spitze zurück
function pfeil(len, kopf, theta, ang, rausch, umgekehrt) {
  const u = [Math.cos(ang), Math.sin(ang)], b = [-u[0], -u[1]], A = [300, 300], T = [300 + u[0] * len, 300 + u[1] * len];
  const rot = (v, w) => [v[0] * Math.cos(w) - v[1] * Math.sin(w), v[0] * Math.sin(w) + v[1] * Math.cos(w)];
  const C = [T[0] + rot(b, theta)[0] * kopf, T[1] + rot(b, theta)[1] * kopf], D = [T[0] + rot(b, -theta)[0] * kopf, T[1] + rot(b, -theta)[1] * kopf];
  const folge = umgekehrt ? [A, T, D, T, C] : [A, T, C, T, D];
  let pts = [];
  for (let i = 0; i + 1 < folge.length; i++) pts = pts.concat(linie(folge[i], folge[i + 1], 5).slice(i ? 1 : 0));
  return verrausche(pts, rausch);
}
const pf = F.erkenne(pfeil(200, 40, 0.5, 0.3, 0.8));
pruefe('Pfeil nach rechts unten (Schaft 200)', pf, 'pfeil', r => Math.hypot(r.punkte[0][0] - 300, r.punkte[0][1] - 300) < 4);
pruefe('Pfeil nach oben, Widerhaken in anderer Reihenfolge', F.erkenne(pfeil(150, 30, 0.45, -Math.PI / 2, 0.8, true)), 'pfeil');
pruefe('Pfeil nach links, kurz (Schaft 90)', F.erkenne(pfeil(90, 20, 0.5, Math.PI, 0.6)), 'pfeil');
pruefe('Pfeil: Spitze sauber, beide Widerhaken gleich lang', pf, 'pfeil', r => {
  // Ecken des gesäuberten Linienzugs: an jeder Ecke liegen zwei Punkte ganz nah beieinander (Spitze, Haken 1, Spitze)
  const p = r.punkte, ecken = [];
  for (let i = 1; i < p.length; i++) if (Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]) < 1) ecken.push([(p[i][0] + p[i - 1][0]) / 2, (p[i][1] + p[i - 1][1]) / 2]);
  if (ecken.length !== 3) return false;
  const [spitze, haken1, spitze2] = ecken, haken2 = p[p.length - 1];
  const l1 = Math.hypot(haken1[0] - spitze[0], haken1[1] - spitze[1]), l2 = Math.hypot(haken2[0] - spitze2[0], haken2[1] - spitze2[1]);
  return Math.hypot(spitze[0] - spitze2[0], spitze[1] - spitze2[1]) < 1.5 && Math.abs(l1 - l2) < 1.5 && l1 > 20;
});
pruefe('Gerade Linie bleibt Linie', F.erkenne(verrausche(linie([300, 300], [480, 380], 5), 1)), 'linie');
// Häkchen: zwei gerade Schenkel (vor 3.13 wurde daraus eine Linie vom Anfang zum Ende)
pruefe('Häkchen wird ein sauberer Winkel', F.erkenne(verrausche(linie([300, 300], [330, 340], 4).concat(linie([330, 340], [420, 240], 4)), 1)), 'winkel', r => Math.hypot(r.ecke[0] - 330, r.ecke[1] - 340) < 6);
pruefe('Rechter Winkel (L)', F.erkenne(verrausche(linie([200, 100], [200, 260], 4).concat(linie([200, 260], [330, 260], 4)), 1)), 'winkel', r => Math.hypot(r.ecke[0] - 200, r.ecke[1] - 260) < 5);
pruefe('Linie mit kleinem Haken am Ende bleibt Linie', F.erkenne(verrausche(linie([300, 300], [480, 300], 4).concat(linie([480, 300], [470, 312], 4)), 0.8)), 'linie');
pruefe('Leicht gebogene Linie bleibt Linie', F.erkenne(Array.from({ length: 50 }, (_, i) => [300 + i * 4, 300 + 6 * Math.sin(i / 49 * Math.PI)])), 'linie');

// Pfeile, wie man sie von Hand zeichnet: runde Umkehr an den Widerhaken, die Spitze beim Zurückkommen nicht genau
// getroffen, als geschlossenes Dreieck, quer hinüber, Spitze zuerst
function pfeilFrei(folge, rund, rausch) {
  let pts = [];
  for (let i = 0; i + 1 < folge.length; i++) pts = pts.concat(linie(folge[i], folge[i + 1], 4).slice(i ? 1 : 0));
  // Ecken abrunden wie eine Hand: gleitender Mittelwert (nicht über die Enden hinaus)
  const glatt = pts.map((_, i) => { let x = 0, y = 0, c = 0; for (let d = -rund; d <= rund; d++) { const q = pts[Math.max(0, Math.min(pts.length - 1, i + d))]; x += q[0]; y += q[1]; c++; } return [x / c, y / c]; });
  return verrausche(glatt, rausch);
}
const istPfeilNach = (r, x, y) => { // Ende des Schafts = Spitze: dort liegen zwei Punkte ganz nah beieinander
  const p = r.punkte; for (let i = 1; i < p.length; i++) if (Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]) < 1) return Math.hypot(p[i][0] - x, p[i][1] - y) < 12; return false; };
pruefe('Pfeil mit runder Umkehr an den Widerhaken', F.erkenne(pfeilFrei([[100, 300], [300, 300], [262, 276], [300, 300], [262, 324]], 2, 0.8)), 'pfeil', r => istPfeilNach(r, 300, 300));
pruefe('Pfeil: Spitze beim Zurückkommen verfehlt', F.erkenne(pfeilFrei([[100, 300], [300, 300], [262, 274], [292, 304], [258, 326]], 1, 0.8)), 'pfeil', r => istPfeilNach(r, 300, 300));
pruefe('Pfeil mit Dreieck als Spitze', F.erkenne(pfeilFrei([[100, 300], [300, 300], [262, 276], [262, 324], [300, 300]], 1, 0.8)), 'pfeil', r => istPfeilNach(r, 300, 300));
pruefe('Pfeil: vom ersten Widerhaken quer zum zweiten', F.erkenne(pfeilFrei([[100, 300], [300, 300], [262, 276], [262, 324]], 1, 0.8)), 'pfeil', r => istPfeilNach(r, 300, 300));
pruefe('Pfeil: Spitze zuerst, dann der Schaft', F.erkenne(pfeilFrei([[262, 276], [300, 300], [262, 324], [300, 300], [100, 300]], 1, 0.8)), 'pfeil', r => istPfeilNach(r, 300, 300));
pruefe('Pfeil schräg nach oben, ungleiche Widerhaken', F.erkenne(pfeilFrei([[100, 400], [260, 240], [215, 248], [258, 243], [250, 292]], 1, 0.8)), 'pfeil', r => istPfeilNach(r, 260, 240));
pruefe('Fahne (nur ein Widerhaken) ist kein Pfeil', F.erkenne(pfeilFrei([[100, 300], [300, 300], [262, 276], [300, 300]], 1, 0.6)), 'linie');
pruefe('Linie hin und zurück ist kein Pfeil', F.erkenne(pfeilFrei([[100, 300], [300, 300], [240, 301]], 1, 0.6)), 'linie');
// Pfeilspitze nachträglich an eine Linie: ein Winkel am Ende der Linie
const dach = F.erkenne(verrausche(linie([262, 276], [300, 300], 4).concat(linie([300, 300], [262, 324], 4)), 0.8));
pruefe('Spitze (>) allein ist ein Winkel', dach, 'winkel');
pruefe('Winkel am Linienende wird zur Pfeilspitze', F.spitzeAn(dach, [303, 301], [1, 0]), 'spitze', r => { const p = r.punkte, m = p[Math.floor(p.length / 2)]; return Math.hypot(m[0] - 303, m[1] - 301) < 1.5 && Math.abs(Math.hypot(p[0][0] - 303, p[0][1] - 301) - Math.hypot(p[p.length - 1][0] - 303, p[p.length - 1][1] - 301)) < 1; });
pruefe('Winkel, der nach vorn zeigt, wird keine Pfeilspitze', F.spitzeAn(dach, [303, 301], [-1, 0]) || { art: 'nein', punkte: [] }, 'nein');
pruefe('Buchstabe M ist kein Pfeil', F.erkenne(verrausche([[0, 100], [0, 0], [50, 60], [100, 0], [100, 100]].flatMap((q, k, a) => k ? linie(a[k - 1], q, 5).slice(1) : [q]), 1.2)), 'linie');
pruefe('Zickzack W ist kein Pfeil', F.erkenne(verrausche([[0, 0], [40, 100], [80, 0], [120, 100], [160, 0]].flatMap((q, k, a) => k ? linie(a[k - 1], q, 5).slice(1) : [q]), 1.2)), 'linie');

// Nichts erkennbar
const herz = [];
for (let i = 0; i <= 80; i++) { const t = 2 * Math.PI * i / 80; herz.push([160 * Math.pow(Math.sin(t), 3), -(130 * Math.cos(t) - 50 * Math.cos(2 * t) - 20 * Math.cos(3 * t) - 10 * Math.cos(4 * t))]); }
pruefe('Herz (nicht in der Liste)', F.erkenne(verrausche(herz, 0.5)), null);
const stern = [];
for (let i = 0; i < 10; i++) { const w = Math.PI * i / 5 - Math.PI / 2, r = i % 2 ? 40 : 100; stern.push([200 + r * Math.cos(w), 200 + r * Math.sin(w)]); }
pruefe('Stern mit 5 Zacken', F.erkenne(verrausche(vieleck(stern, 5, 1, true), 0.5)), null);

// Kritzeln: Zickzack erkennen, Schrift nicht
// Hin und her: Bahnen der Länge 'laenge' (senkrecht oder waagrecht), jede Bahn um 'vorschub' weiter seitlich
function zickzack(x0, y0, laenge, vorschub, bahnen, schritt, waagrecht) {
  const pts = [];
  for (let i = 0; i <= bahnen; i++) {
    const a = i % 2 ? laenge : 0, b = i % 2 ? 0 : laenge, v = i * vorschub;
    const n = Math.max(2, Math.round(laenge / schritt));
    for (let j = 0; j < n; j++) {
      const t = j / n, lang = a + (b - a) * t, quer = v + vorschub * t;
      pts.push(waagrecht ? [x0 + lang, y0 + quer] : [x0 + quer, y0 + lang]);
    }
  }
  return pts;
}
const kritzel = (name, pts, erwartet) => { const ok = F.istKritzel(pts) === erwartet; if (!ok) fehler++; console.log((ok ? 'ok     ' : 'FEHLER ') + name.padEnd(46) + '-> ' + F.istKritzel(pts)); };
kritzel('Wort durchgestrichen: 7 Bahnen waagrecht', verrausche(zickzack(100, 100, 150, 7, 7, 5, true), 0.7), true);
kritzel('Senkrecht schraffiert: 12 Bahnen', verrausche(zickzack(100, 100, 40, 8, 12, 5, false), 0.7), true);
kritzel('Eng, nur 5 Bahnen', verrausche(zickzack(100, 100, 60, 10, 5, 5, false), 0.7), true);
kritzel('Zickzack mit 3 Bahnen (zu wenig)', verrausche(zickzack(100, 100, 50, 10, 3, 5, false), 0.7), false);
kritzel('Gebirge (breiter Zickzack, kein Kritzeln)', verrausche(zickzack(100, 100, 50, 30, 8, 5, false), 0.7), false);
kritzel('Langsame Welle (Handschrift "ee")', verrausche(ellipse(100, 100, 40, 12, 0, 40, 0).concat(ellipse(180, 100, 40, 12, 0, 40, 0)), 0.5), false);
const kreisel = []; for (let i = 0; i < 120; i++) kreisel.push([200 + 30 * Math.cos(i / 5), 200 + 30 * Math.sin(i / 5)]);
kritzel('Kreisel (Kreise übereinander)', kreisel, false);
const langeLinie = []; for (let i = 0; i <= 60; i++) langeLinie.push([i * 5, 100 + Math.sin(i / 3) * 3]);
kritzel("Lange, fast gerade Linie", langeLinie, false);

console.log(fehler ? `\n${fehler} Fehler` : '\nAlles in Ordnung');
process.exit(fehler ? 1 : 0);
