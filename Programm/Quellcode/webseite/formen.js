'use strict';
// Formerkennung für Handschrift: ein Strich wird zu einer Linie, einem Dreieck, Viereck, Rechteck (Quadrat),
// einer Ellipse oder einem Kreis, immer aus den Punkten, die gezeichnet wurden: Lage, Grösse und Drehung bleiben.
// Reines JavaScript ohne Abhängigkeiten (Browser und Node, wie format.js).
//
//   LHFormen.erkenne(punkte)  ->  { art, punkte: [[x, y], ...] }  oder  null (nichts passt, Strich bleibt wie er ist)
//   art: 'linie' | 'dreieck' | 'viereck' | 'rechteck' | 'kreis' | 'ellipse'
//   punkte: Koordinaten der sauberen Form, dicht genug, dass die Kurvenglättung der Leinwand sie nicht verrundet
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.LHFormen = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  const PI2 = Math.PI * 2;
  const grad = w => w * Math.PI / 180;
  const r1 = n => Math.round(n * 10) / 10;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  const MIN_LAENGE = 14;            // kürzere Striche sind ein Punkt oder ein Tippen
  // Seit 3.14 nachsichtiger (vorher 0,22 / 0,085 / 4°): eine Form darf ein gutes Viertel offen bleiben, wackliger
  // gezeichnet und schiefer sein und wird trotzdem erkannt. Herz, Stern und Wolke bleiben, was sie sind (test/formen.js).
  const OFFEN_ANTEIL = 0.26;        // Abstand Anfang-Ende bis zu diesem Anteil der Länge: geschlossene Form
  const ECKEN_TOLERANZ = 0.11;      // mittlere Abweichung (Anteil des Radius), bis zu der eine Form noch passt
  const ACHSEN_RASTER = grad(6);    // fast waagrecht oder senkrecht: genau waagrecht oder senkrecht

  function laenge(p) {
    let l = 0;
    for (let i = 1; i < p.length; i++) l += dist(p[i - 1], p[i]);
    return l;
  }

  // Doppelte (und fast doppelte) Punkte entfernen
  function bereinige(p) {
    const r = [];
    for (const q of p) if (!r.length || dist(r[r.length - 1], q) > 0.05) r.push([q[0], q[1]]);
    return r;
  }

  // n Punkte im gleichen Abstand entlang des Wegs. geschlossen: der Weg läuft vom letzten zurück zum ersten Punkt.
  function abtasten(p, n, geschlossen) {
    const weg = geschlossen ? p.concat([p[0]]) : p;
    const l = laenge(weg);
    const schritt = l / (geschlossen ? n : n - 1);
    const r = [[weg[0][0], weg[0][1]]];
    let ziel = schritt, lauf = 0;
    for (let i = 1; i < weg.length && r.length < n; i++) {
      const s = dist(weg[i - 1], weg[i]);
      while (s > 0 && lauf + s >= ziel - 1e-9 && r.length < n) {
        const t = (ziel - lauf) / s;
        r.push([weg[i - 1][0] + (weg[i][0] - weg[i - 1][0]) * t, weg[i - 1][1] + (weg[i][1] - weg[i - 1][1]) * t]);
        ziel += schritt;
      }
      lauf += s;
    }
    while (r.length < n) r.push([weg[weg.length - 1][0], weg[weg.length - 1][1]]);
    return r;
  }

  function abstandZurStrecke(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  // Douglas-Peucker auf p[i0..i1]: merkt sich die Indizes der wichtigen Punkte in keep
  function dp(p, i0, i1, eps, keep) {
    let dMax = 0, iMax = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = abstandZurStrecke(p[i], p[i0], p[i1]);
      if (d > dMax) { dMax = d; iMax = i; }
    }
    if (iMax >= 0 && dMax > eps) { dp(p, i0, iMax, eps, keep); keep.add(iMax); dp(p, iMax, i1, eps, keep); }
  }

  // Ecken einer geschlossenen, gleichmässig abgetasteten Linie: Indizes in aufsteigender Reihenfolge
  function ecken(p, eps) {
    const n = p.length;
    let fern = 0, df = 0;
    for (let i = 1; i < n; i++) { const d = dist(p[0], p[i]); if (d > df) { df = d; fern = i; } }
    const keep = new Set([0, fern]);
    const kreis = p.concat([p[0]]);
    dp(kreis, 0, fern, eps, keep);
    dp(kreis, fern, n, eps, keep);
    return [...keep].sort((a, b) => a - b);
  }

  const drehung = (a, b, c) => {
    const x1 = b[0] - a[0], y1 = b[1] - a[1], x2 = c[0] - b[0], y2 = c[1] - b[1];
    return Math.abs(Math.atan2(x1 * y2 - y1 * x2, x1 * x2 + y1 * y2));
  };

  // Fast gerade Ecken weglassen, sehr nahe Ecken zusammenfassen
  function bereinigeEcken(p, idx, minAbstand) {
    let v = idx.slice();
    for (let runde = 0; runde < 20 && v.length > 3; runde++) {
      let aendert = false;
      for (let i = 0; i < v.length && v.length > 3; i++) {
        const a = p[v[(i + v.length - 1) % v.length]], b = p[v[i]], c = p[v[(i + 1) % v.length]];
        if (drehung(a, b, c) < grad(22)) { v.splice(i, 1); aendert = true; break; }
      }
      if (aendert) continue;
      for (let i = 0; i < v.length && v.length > 3; i++) {
        const j = (i + 1) % v.length;
        if (dist(p[v[i]], p[v[j]]) < minAbstand) {
          // die beiden verschmelzen: der Punkt, der weiter von seinen Nachbarn entfernt ist, bleibt
          const a = p[v[(i + v.length - 1) % v.length]], b = p[v[i]], c = p[v[j]], d = p[v[(j + 1) % v.length]];
          const wegI = dist(a, b) + dist(b, c), wegJ = dist(b, c) + dist(c, d);
          v.splice(wegI > wegJ ? j : i, 1);
          aendert = true;
          break;
        }
      }
      if (!aendert) break;
    }
    return v;
  }

  // Gerade durch Punkte (Hauptachse): { c: Mittelpunkt, u: Richtung }
  function gerade(pts) {
    let cx = 0, cy = 0;
    for (const q of pts) { cx += q[0]; cy += q[1]; }
    cx /= pts.length; cy /= pts.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const q of pts) { const x = q[0] - cx, y = q[1] - cy; sxx += x * x; sxy += x * y; syy += y * y; }
    const w = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return { c: [cx, cy], u: [Math.cos(w), Math.sin(w)] };
  }
  function schnitt(g1, g2) {
    const det = g1.u[0] * g2.u[1] - g1.u[1] * g2.u[0];
    if (Math.abs(det) < 0.15) return null;   // fast parallel
    const dx = g2.c[0] - g1.c[0], dy = g2.c[1] - g1.c[1];
    const t = (dx * g2.u[1] - dy * g2.u[0]) / det;
    return [g1.c[0] + g1.u[0] * t, g1.c[1] + g1.u[1] * t];
  }

  // Ecken genauer: Schnittpunkte der Geraden durch die Seiten (gezeichnete Ecken sind meist abgerundet)
  function verfeinere(p, idx, l) {
    const k = idx.length, n = p.length;
    const seiten = [];
    for (let i = 0; i < k; i++) {
      const a = idx[i], b = i + 1 < k ? idx[i + 1] : idx[0] + n;
      const von = a + (b - a) * 0.18, bis = b - (b - a) * 0.18;
      const pts = [];
      for (let j = Math.ceil(von); j <= Math.floor(bis); j++) pts.push(p[j % n]);
      seiten.push(pts.length >= 3 ? gerade(pts) : null);
    }
    return idx.map((ix, i) => {
      const alt = p[ix], g1 = seiten[(i + k - 1) % k], g2 = seiten[i];
      const q = g1 && g2 ? schnitt(g1, g2) : null;
      return q && dist(q, alt) < l * 0.12 ? q : alt;
    });
  }

  function mittlererAbstandZuVieleck(p, v) {
    let s = 0;
    for (const q of p) {
      let d = Infinity;
      for (let i = 0; i < v.length; i++) d = Math.min(d, abstandZurStrecke(q, v[i], v[(i + 1) % v.length]));
      s += d;
    }
    return s / p.length;
  }

  /* ---------- Ellipse ---------- */

  function passeEllipse(p) {
    const n = p.length;
    let cx = 0, cy = 0;
    for (const q of p) { cx += q[0]; cy += q[1]; }
    cx /= n; cy /= n;
    let sxx = 0, sxy = 0, syy = 0;
    for (const q of p) { const x = q[0] - cx, y = q[1] - cy; sxx += x * x; sxy += x * y; syy += y * y; }
    sxx /= n; sxy /= n; syy /= n;
    const m = (sxx + syy) / 2, d = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
    let a = Math.SQRT2 * Math.sqrt(m + d), b = Math.SQRT2 * Math.sqrt(Math.max(1e-9, m - d));
    const w = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const co = Math.cos(w), si = Math.sin(w);
    // Massstab so, dass die Punkte im Mittel genau auf der Ellipse liegen
    const rhoVon = (q, par) => {
      const x = q[0] - par[0], y = q[1] - par[1], co2 = Math.cos(par[4]), si2 = Math.sin(par[4]);
      return Math.hypot((x * co2 + y * si2) / par[2], (-x * si2 + y * co2) / par[3]);
    };
    let par = [cx, cy, a, b, w];
    const mit = p.reduce((s, q) => s + rhoVon(q, par), 0) / n;
    par[2] *= mit; par[3] *= mit;
    // Genauer: die fünf Werte so verschieben, dass der Abstand aller Punkte zur Ellipse minimal wird. Der Mittelwert
    // allein ist schief, wenn Anfang und Ende überlappen oder die Punkte ungleich verteilt sind.
    const kosten = pr => { let s = 0; const f = Math.sqrt(pr[2] * pr[3]); for (const q of p) { const r = (rhoVon(q, pr) - 1) * f; s += r * r; } return s; };
    let lambda = 1e-3, k0 = kosten(par);
    for (let it = 0; it < 25; it++) {
      const J = [], res = [];
      const f0 = Math.sqrt(par[2] * par[3]);
      for (const q of p) res.push((rhoVon(q, par) - 1) * f0);
      for (let j = 0; j < 5; j++) {
        const h = j === 4 ? 1e-4 : 1e-3 * Math.max(1, par[2]), q2 = par.slice(); q2[j] += h;
        const f1 = Math.sqrt(q2[2] * q2[3]);
        J.push(p.map((q, i) => ((rhoVon(q, q2) - 1) * f1 - res[i]) / h));
      }
      const A = [], g = [];
      for (let r = 0; r < 5; r++) {
        A.push([]);
        g.push(0);
        for (let c = 0; c < 5; c++) { let s = 0; for (let i = 0; i < n; i++) s += J[r][i] * J[c][i]; A[r].push(s); }
        for (let i = 0; i < n; i++) g[r] -= J[r][i] * res[i];
      }
      for (let r = 0; r < 5; r++) A[r][r] *= 1 + lambda;
      // Gleichungssystem lösen (Gauss mit Spaltenwahl)
      const M = A.map((z, r) => z.concat([g[r]]));
      let ok = true;
      for (let c = 0; c < 5 && ok; c++) {
        let m = c;
        for (let r = c + 1; r < 5; r++) if (Math.abs(M[r][c]) > Math.abs(M[m][c])) m = r;
        if (Math.abs(M[m][c]) < 1e-12) { ok = false; break; }
        [M[c], M[m]] = [M[m], M[c]];
        for (let r = c + 1; r < 5; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= 5; k++) M[r][k] -= f * M[c][k]; }
      }
      if (!ok) break;
      const dx = [0, 0, 0, 0, 0];
      for (let r = 4; r >= 0; r--) { let s = M[r][5]; for (let c = r + 1; c < 5; c++) s -= M[r][c] * dx[c]; dx[r] = s / M[r][r]; }
      const neu = par.map((v, i) => v + dx[i]);
      if (neu[2] > 1 && neu[3] > 1) {
        const k1 = kosten(neu);
        if (k1 < k0) { par = neu; lambda = Math.max(1e-6, lambda / 3); if (k0 - k1 < 1e-9 * k0) { k0 = k1; break; } k0 = k1; continue; }
      }
      lambda *= 5;
    }
    // Hauptachse a >= b
    if (par[3] > par[2]) par = [par[0], par[1], par[3], par[2], par[4] + Math.PI / 2];
    const fehler = p.reduce((s, q) => s + Math.abs(rhoVon(q, par) - 1), 0) / n;
    return { cx: par[0], cy: par[1], a: par[2], b: par[3], w: par[4], fehler };
  }

  function rasterWinkel(w) {
    // auf 0 oder 90 Grad rasten, wenn nah dran
    const q = Math.round(w / (Math.PI / 2)) * (Math.PI / 2);
    return Math.abs(w - q) < ACHSEN_RASTER ? q : w;
  }

  function ellipsePunkte(e, startWinkel, richtung) {
    const umfang = Math.PI * (3 * (e.a + e.b) - Math.sqrt((3 * e.a + e.b) * (e.a + 3 * e.b)));
    const n = Math.max(48, Math.min(240, Math.round(umfang / 6)));
    const co = Math.cos(e.w), si = Math.sin(e.w);
    const r = [];
    for (let i = 0; i <= n; i++) {
      const t = startWinkel + richtung * PI2 * i / n;
      const x = e.a * Math.cos(t), y = e.b * Math.sin(t);
      r.push([r1(e.cx + x * co - y * si), r1(e.cy + x * si + y * co)]);
    }
    return r;
  }

  /* ---------- Vielecke ---------- */

  // Seiten dicht besetzen; an jeder Ecke zwei Punkte ganz nah beieinander, damit die Kurvenglättung die Ecke nicht abrundet
  function vieleckPunkte(v, start) {
    const k = v.length, kante = 0.4, schritt = 8;
    const pts = [];
    for (let s = 0; s < k; s++) {
      const a = v[(start + s) % k], b = v[(start + s + 1) % k];
      const l = dist(a, b);
      if (l < 1e-6) continue;
      const ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l;
      const von = Math.min(kante, l / 3), bis = l - von;
      const n = Math.max(1, Math.round((bis - von) / schritt));
      for (let i = 0; i <= n; i++) {
        const t = von + (bis - von) * i / n;
        pts.push([r1(a[0] + ux * t), r1(a[1] + uy * t)]);
      }
    }
    pts.push(pts[0].slice());
    return pts;
  }

  function naechsteEcke(v, q) {
    let best = 0, bd = Infinity;
    v.forEach((c, i) => { const d = dist(c, q); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // Gleichseitiges Dreieck, wenn das gezeichnete schon fast eins ist
  function gleichseitig(v) {
    const s = [dist(v[0], v[1]), dist(v[1], v[2]), dist(v[2], v[0])];
    const mit = (s[0] + s[1] + s[2]) / 3;
    if ((Math.max(...s) - Math.min(...s)) / mit > 0.2) return null;
    const cx = (v[0][0] + v[1][0] + v[2][0]) / 3, cy = (v[0][1] + v[1][1] + v[2][1]) / 3;
    const R = v.reduce((m, q) => m + dist(q, [cx, cy]), 0) / 3;
    // Drehsinn der gezeichneten Reihenfolge
    const flaeche = (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[1][1] - v[0][1]) * (v[2][0] - v[0][0]);
    const dir = flaeche >= 0 ? 1 : -1;
    // Anfangswinkel: Mittel der Winkel der drei Ecken, jeweils um ihren Anteil von 120 Grad zurückgedreht
    let sx = 0, sy = 0;
    v.forEach((q, i) => { const w = Math.atan2(q[1] - cy, q[0] - cx) - dir * i * PI2 / 3; sx += Math.cos(w); sy += Math.sin(w); });
    const w0 = Math.atan2(sy, sx);
    return v.map((_, i) => [cx + R * Math.cos(w0 + dir * i * PI2 / 3), cy + R * Math.sin(w0 + dir * i * PI2 / 3)]);
  }

  // Rechteck aus vier Ecken: Drehung aus den Seitenrichtungen, Seiten aus den Mittelwerten
  function rechteck(v) {
    let sx = 0, sy = 0;
    for (let i = 0; i < 4; i++) {
      const a = v[i], b = v[(i + 1) % 4];
      const w = Math.atan2(b[1] - a[1], b[0] - a[0]), l = dist(a, b);
      sx += l * Math.cos(4 * w); sy += l * Math.sin(4 * w);
    }
    let w = Math.atan2(sy, sx) / 4;
    w = rasterWinkel(w);
    const co = Math.cos(w), si = Math.sin(w);
    const u = v.map(q => q[0] * co + q[1] * si), t = v.map(q => -q[0] * si + q[1] * co);
    const mitte = arr => { const s = arr.slice().sort((x, y) => x - y); return [(s[0] + s[1]) / 2, (s[2] + s[3]) / 2]; };
    const [u0, u1] = mitte(u), [t0, t1] = mitte(t);
    let b = u1 - u0, h = t1 - t0;
    const cu = (u0 + u1) / 2, ct = (t0 + t1) / 2;
    if (Math.abs(b - h) / Math.max(b, h) < 0.15) b = h = (b + h) / 2;
    const ecke = (du, dt) => [(cu + du * b / 2) * co - (ct + dt * h / 2) * si, (cu + du * b / 2) * si + (ct + dt * h / 2) * co];
    // gleiche Reihenfolge wie gezeichnet: die nächstliegende Ecke zuerst
    const neu = [ecke(-1, -1), ecke(1, -1), ecke(1, 1), ecke(-1, 1)];
    const start = naechsteEcke(neu, v[0]);
    const ausV = neu.map((_, i) => neu[(start + i) % 4]);
    // Drehsinn wie gezeichnet
    const flV = (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[1][1] - v[0][1]) * (v[2][0] - v[0][0]);
    const flN = (ausV[1][0] - ausV[0][0]) * (ausV[2][1] - ausV[0][1]) - (ausV[1][1] - ausV[0][1]) * (ausV[2][0] - ausV[0][0]);
    return { ecken: flV * flN < 0 ? [ausV[0], ausV[3], ausV[2], ausV[1]] : ausV, quadrat: b === h };
  }

  // Rechte Winkel (bis 22 Grad daneben) und gegenüberliegende Seiten ähnlich lang: sonst ist es ein allgemeines Viereck
  function sindRechteWinkel(v) {
    for (let i = 0; i < 4; i++) {
      const a = v[(i + 3) % 4], b = v[i], c = v[(i + 1) % 4];
      const w = drehung(a, b, c);
      if (Math.abs(w - Math.PI / 2) > grad(22)) return false;
    }
    const s = [dist(v[0], v[1]), dist(v[1], v[2]), dist(v[2], v[3]), dist(v[3], v[0])];
    return Math.min(s[0], s[2]) / Math.max(s[0], s[2]) > 0.66 && Math.min(s[1], s[3]) / Math.max(s[1], s[3]) > 0.66;
  }

  /* ---------- Vielecke mit fünf bis acht Ecken ---------- */

  const MAX_VIELECK = 8;
  const klemme = (v, a, b) => (v < a ? a : v > b ? b : v);

  // Für mehrere Toleranzen die Ecken suchen; je Eckenzahl (5 bis 8) das erste Ergebnis mit seinem Abstand zur Linie
  // (Anteil des Radius). Aufsteigend nach Eckenzahl.
  function vieleckKandidaten(s, l, R) {
    const gesehen = new Map();
    for (const f of [0.015, 0.02, 0.03, 0.045, 0.065, 0.09, 0.12]) {
      const idx = bereinigeEcken(s, ecken(s, f * l), 0.07 * l);
      const n = idx.length;
      if (n < 5 || n > MAX_VIELECK || gesehen.has(n)) continue;
      const v = verfeinere(s, idx, l);
      // Abstand der Punkte zum Vieleck: im Mittel, und der Wert, unter dem 90 % der Punkte liegen (ein Herz oder eine
      // Wolke hat im Mittel kleine Abstände, aber ein Zehntel der Punkte liegt weit weg, ein echtes Vieleck nicht)
      const d = s.map(q => { let m = Infinity; for (let i = 0; i < v.length; i++) m = Math.min(m, abstandZurStrecke(q, v[i], v[(i + 1) % v.length])); return m; });
      const mittel = d.reduce((a, b) => a + b, 0) / d.length;
      d.sort((a, b) => a - b);
      gesehen.set(n, { n, v, fehler: mittel / R, streuung: d[Math.floor(0.9 * (d.length - 1))] / R });
    }
    return [...gesehen.values()].sort((a, b) => a.n - b.n);
  }

  // Ein fast regelmässiges Vieleck wird ein genau regelmässiges: gleiche Seiten, gleiche Winkel, Mitte und Radius aus den
  // gezeichneten Ecken, Drehung so, dass eine Ecke oder eine Seite nah an einer Achse genau auf ihr liegt. null: unregelmässig.
  function regulaer(v) {
    const n = v.length;
    let cx = 0, cy = 0;
    for (const q of v) { cx += q[0]; cy += q[1]; }
    cx /= n; cy /= n;
    const rad = v.map(q => dist(q, [cx, cy])), R = rad.reduce((a, b) => a + b, 0) / n;
    const seiten = v.map((q, i) => dist(q, v[(i + 1) % n])), sm = seiten.reduce((a, b) => a + b, 0) / n;
    if (Math.max(...rad) - Math.min(...rad) > 0.3 * R || Math.max(...seiten) - Math.min(...seiten) > 0.36 * sm) return null;
    let flaeche = 0;
    for (let i = 0; i < n; i++) { const a = v[i], b = v[(i + 1) % n]; flaeche += a[0] * b[1] - b[0] * a[1]; }
    const dir = flaeche >= 0 ? 1 : -1, schritt = PI2 / n;
    // Winkel der Ecken gleichmässig verteilt?
    const winkel = v.map(q => Math.atan2(q[1] - cy, q[0] - cx));
    for (let i = 0; i < n; i++) {
      let d = dir * (winkel[(i + 1) % n] - winkel[i]);
      d = ((d % PI2) + PI2) % PI2;
      if (Math.abs(d - schritt) > 0.42 * schritt) return null;
    }
    // Anfangswinkel: Mittel der Eckenwinkel, jeder um seinen Anteil zurückgedreht
    let sx = 0, sy = 0;
    v.forEach((q, i) => { const w = winkel[i] - dir * i * schritt; sx += Math.cos(w); sy += Math.sin(w); });
    let w0 = Math.atan2(sy, sx);
    // Auf eine Achse rasten: Ecke oder Seitenmitte
    let best = null;
    for (let k = 0; k < n; k++) {
      for (const versatz of [0, schritt / 2]) {
        const a = w0 + dir * (k * schritt + versatz);
        const d = Math.round(a / (Math.PI / 2)) * (Math.PI / 2) - a;
        if (Math.abs(d) < grad(5) && (best === null || Math.abs(d) < Math.abs(best))) best = d;
      }
    }
    if (best !== null) w0 += best;
    return v.map((_, i) => [cx + R * Math.cos(w0 + dir * i * schritt), cy + R * Math.sin(w0 + dir * i * schritt)]);
  }

  // Vieleck mit 5 bis 8 Ecken, wenn eines deutlich besser passt als eine Ellipse; sonst null. Je mehr Ecken, desto
  // weniger unterscheidet sich ein Vieleck von einem Kreis: ab sieben Ecken wird deshalb genauer geprüft.
  // Gemessen an künstlich gezeichneten Formen (Rauschen, abgerundete Ecken): ein echtes n-Eck liegt bei einem mittleren
  // Fehler von 0,004 bis 0,022 des Radius, einem p90-Fehler bis 0,049 und bei 0,1 bis 0,7 des Ellipsenfehlers. Ein Kreis
  // oder eine Ellipse mit gleich vielen Ecken liegt bei mindestens 0,8 des Ellipsenfehlers (meist ein Mehrfaches), ein
  // Herz, ein Tropfen oder eine Wolke bei einem p90-Fehler ab 0,078.
  function erkenneVieleck(s, p, l, R, ellipse) {
    for (const c of vieleckKandidaten(s, l, R)) {
      const grenze = c.n <= 6 ? 0.03 : c.n === 7 ? 0.026 : 0.022, gegen = c.n <= 6 ? 0.62 : 0.55;
      if (c.fehler > grenze || c.streuung > 0.055 || c.fehler > ellipse.fehler * gegen) continue;
      const reg = regulaer(c.v);
      const v = reg || c.v;
      return { art: 'vieleck', ecken: c.n, regelmaessig: !!reg, punkte: vieleckPunkte(v, naechsteEcke(v, p[0])) };
    }
    return null;
  }

  /* ---------- Pfeil ---------- */

  // Punkte entlang eines offenen Linienzugs, an jeder Ecke zwei Punkte ganz nah beieinander (wie bei vieleckPunkte)
  function linienzugPunkte(v) {
    const pts = [], kante = 0.4, schritt = 8;
    for (let s = 0; s + 1 < v.length; s++) {
      const a = v[s], b = v[s + 1], l = dist(a, b);
      if (l < 1e-6) continue;
      const ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l;
      const von = s === 0 ? 0 : Math.min(kante, l / 3), bis = s + 2 === v.length ? l : l - Math.min(kante, l / 3);
      const n = Math.max(1, Math.round((bis - von) / schritt));
      for (let i = 0; i <= n; i++) {
        const t = von + (bis - von) * i / n;
        pts.push([r1(a[0] + ux * t), r1(a[1] + uy * t)]);
      }
    }
    return pts;
  }

  // Ein Pfeil in einem Zug: der Schaft von A zur Spitze, dann die beiden Widerhaken, egal wie man sie zeichnet: von
  // der Spitze zurück, wieder zur Spitze und zum zweiten (">"), als geschlossenes Dreieck, oder vom ersten Widerhaken
  // quer hinüber zum zweiten. Auch andersherum (erst die Spitze, dann der Schaft). Gesäubert: gerader Schaft, zwei gleich
  // lange Widerhaken im gleichen Winkel zur Spitze. null, wenn es kein Pfeil ist.
  // Erkannt wird nicht mehr an der Zahl der Ecken (vor 3.13: genau "Spitze, Haken, Spitze, Haken", schon eine rund
  // gezeichnete Umkehr machte daraus eine Linie), sondern an der Gestalt: Die Spitze ist der Punkt, der am weitesten
  // vom Anfang liegt; bis dorthin ist der Strich gerade; danach bleibt er nahe bei der Spitze und reicht auf beiden
  // Seiten des Schafts ein Stück zurück.
  function pfeilVon(p) {
    const A = p[0], n = p.length;
    let iT = 0, Ls = 0;
    for (let i = 1; i < n; i++) { const d = dist(p[i], A); if (d > Ls) Ls = d; }
    if (Ls < 40) return null;
    // Das erste Mal an der Spitze (für den zweiten Widerhaken kommt der Stift oft noch einmal dorthin zurück)
    while (iT < n - 1 && dist(p[iT], A) < Ls - Math.max(2.5, 0.025 * Ls)) iT++;
    while (iT < n - 1 && dist(p[iT + 1], A) > dist(p[iT], A)) iT++;
    Ls = dist(p[iT], A);
    if (iT < 1 || iT > n - 3) return null;
    const T = p[iT];
    // Der Schaft ist gerade
    for (let i = 0; i <= iT; i++) if (abstandZurStrecke(p[i], A, T) > Math.max(4, 0.07 * Ls)) return null;
    const u = [(T[0] - A[0]) / Ls, (T[1] - A[1]) / Ls];
    const quer = w => u[0] * w[1] - u[1] * w[0], zurueck = w => -(u[0] * w[0] + u[1] * w[1]);
    // Der Kopf: was nach der Spitze kommt. Der äusserste Punkt auf jeder Seite des Schafts ist das Ende eines Widerhakens.
    let C = null, D = null, qC = 0, qD = 0, weit = 0, weg = 0;
    for (let i = iT + 1; i < n; i++) {
      const w = [p[i][0] - T[0], p[i][1] - T[1]], q = quer(w);
      weit = Math.max(weit, Math.hypot(w[0], w[1]));
      weg += dist(p[i - 1], p[i]);
      if (q > qC) { qC = q; C = w; }
      if (q < qD) { qD = q; D = w; }
    }
    if (!C || !D) return null;
    const lc = Math.hypot(C[0], C[1]), ld = Math.hypot(D[0], D[1]), L = (lc + ld) / 2, lMax = Math.max(lc, ld);
    // Beide Widerhaken sind da, ähnlich lang, deutlich kürzer als der Schaft, und stehen deutlich zur Seite
    if (Math.min(lc, ld) < 8 || Math.min(lc, ld) < 0.45 * lMax || L > 0.6 * Ls || L < 0.07 * Ls) return null;
    if (Math.min(qC, -qD) < Math.max(4, 0.03 * Ls)) return null;
    // Sie zeigen nach hinten, im Winkel von etwa 12 bis 75 Grad zum Schaft
    if (zurueck(C) <= 0 || zurueck(D) <= 0) return null;
    const wC = Math.atan2(qC, zurueck(C)), wD = Math.atan2(-qD, zurueck(D));
    if (Math.min(wC, wD) < grad(12) || Math.max(wC, wD) > grad(75) || Math.abs(wC - wD) > grad(35)) return null;
    // Der Kopf bleibt bei der Spitze und ist nicht mehr als die beiden Widerhaken (hin und zurück)
    if (weit > 1.35 * lMax || weg < 0.8 * (lc + ld) || weg > 3.4 * (lc + ld)) return null;
    // Sauber: Widerhaken so lang wie gezeichnet (in Grenzen), Winkel zwischen 22 und 38 Grad
    const theta = klemme((wC + wD) / 2, grad(22), grad(38));
    const kopf = klemme(L, Math.max(10, 0.1 * Ls), Math.min(80, 0.4 * Ls));
    const b = [-u[0], -u[1]], c = Math.cos(theta), si = Math.sin(theta);
    const haken = s => [T[0] + kopf * (b[0] * c - b[1] * si * s), T[1] + kopf * (b[0] * si * s + b[1] * c)];
    // quer > 0 liegt in Schreibrichtung rechts: das ist die Drehung der Rückrichtung um -theta
    const hC = haken(-1), hD = haken(1);
    // Schaft von A bis zur Spitze, die Widerhaken in der gezeichneten Reihenfolge
    let erstC = true;
    for (let i = iT + 1; i < n; i++) { const q = quer([p[i][0] - T[0], p[i][1] - T[1]]); if (Math.abs(q) > 0.5 * Math.min(qC, -qD)) { erstC = q > 0; break; } }
    return { art: 'pfeil', punkte: linienzugPunkte(erstC ? [A, T, hC, T, hD] : [A, T, hD, T, hC]) };
  }
  function erkennePfeil(p) {
    return pfeilVon(p) || pfeilVon(p.slice().reverse());
  }

  // Ein Winkel: zwei gerade Schenkel mit einer Ecke (V, L, Haken, Dach). Gesäubert: beide Schenkel gerade, die Ecke am
  // Schnittpunkt. null, wenn der Strich mehr oder weniger Ecken hat oder fast gerade ist.
  function erkenneWinkel(p, l) {
    const n = p.length, keep = new Set([0, n - 1]);
    dp(p, 0, n - 1, Math.max(4, 0.05 * l), keep);
    if (keep.size !== 3) return null;
    const idx = [...keep].sort((a, b) => a - b), A = p[0], C = p[n - 1];
    let B = p[idx[1]];
    const la = dist(A, B), lb = dist(B, C);
    if (Math.min(la, lb) < Math.max(12, 0.18 * l)) return null;
    // Genauer: Schnittpunkt der Geraden durch die beiden Schenkel (gezeichnete Ecken sind meist rund)
    const t1 = p.slice(0, Math.max(2, Math.round(idx[1] * 0.8))), t2 = p.slice(Math.min(n - 2, Math.round(idx[1] + (n - 1 - idx[1]) * 0.2)));
    const sp = t1.length >= 2 && t2.length >= 2 ? schnitt(gerade(t1), gerade(t2)) : null;
    if (sp && dist(sp, B) < 0.15 * l) B = sp;
    const cos = ((A[0] - B[0]) * (C[0] - B[0]) + (A[1] - B[1]) * (C[1] - B[1])) / (dist(A, B) * dist(C, B) || 1);
    const oeffnung = Math.acos(klemme(cos, -1, 1));
    if (oeffnung > grad(152) || oeffnung < grad(12)) return null;   // fast gerade oder hin und zurück: eine Linie
    return { art: 'winkel', ecke: [r1(B[0]), r1(B[1])], enden: [A.slice(0, 2), C.slice(0, 2)], punkte: linienzugPunkte([A, B, C]) };
  }

  // Pfeilspitze an eine vorhandene Linie: ein Winkel (erkenneWinkel), dessen Ecke am Ende E einer Linie liegt, die dort
  // in Richtung u (Einheitsvektor, zum Ende hin) läuft. Die Schenkel müssen wie Widerhaken nach hinten zeigen, auf
  // verschiedenen Seiten der Linie. Gesäubert sitzt die Spitze genau auf E. null, wenn es nicht passt.
  function spitzeAn(winkel, E, u) {
    if (!winkel || winkel.art !== 'winkel') return null;
    const quer = w => u[0] * w[1] - u[1] * w[0], zurueck = w => -(u[0] * w[0] + u[1] * w[1]);
    const [P, Q] = winkel.enden.map(q => [q[0] - winkel.ecke[0], q[1] - winkel.ecke[1]]);
    if (quer(P) * quer(Q) >= 0 || zurueck(P) <= 0 || zurueck(Q) <= 0) return null;
    const wP = Math.atan2(Math.abs(quer(P)), zurueck(P)), wQ = Math.atan2(Math.abs(quer(Q)), zurueck(Q));
    if (Math.min(wP, wQ) < grad(10) || Math.max(wP, wQ) > grad(80) || Math.abs(wP - wQ) > grad(40)) return null;
    const lp = Math.hypot(P[0], P[1]), lq = Math.hypot(Q[0], Q[1]);
    if (Math.min(lp, lq) < 0.4 * Math.max(lp, lq)) return null;
    const theta = klemme((wP + wQ) / 2, grad(22), grad(38)), kopf = klemme((lp + lq) / 2, 10, 90);
    const b = [-u[0], -u[1]], c = Math.cos(theta), si = Math.sin(theta);
    const haken = s => [E[0] + kopf * (b[0] * c - b[1] * si * s), E[1] + kopf * (b[0] * si * s + b[1] * c)];
    const erst = quer(P) > 0 ? -1 : 1;
    return { art: 'spitze', punkte: linienzugPunkte([haken(erst), E, haken(-erst)]) };
  }

  /* ---------- Erkennen ---------- */

  function erkenne(eingabe) {
    const p = bereinige(eingabe);
    if (p.length < 2) return null;
    const l = laenge(p);
    if (l < MIN_LAENGE) return null;
    const luecke = dist(p[0], p[p.length - 1]);

    // Offen: ein Pfeil (Schaft mit zwei Widerhaken in einem Zug), ein Winkel (zwei gerade Schenkel) oder eine Linie
    // von Anfang bis Ende
    if (luecke > OFFEN_ANTEIL * l) {
      return erkennePfeil(p) || erkenneWinkel(p, l) || { art: 'linie', punkte: [p[0].slice(), p[p.length - 1].slice()] };
    }

    // Geschlossen: Kreis, Ellipse, Dreieck oder Viereck
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (const q of p) { xMin = Math.min(xMin, q[0]); xMax = Math.max(xMax, q[0]); yMin = Math.min(yMin, q[1]); yMax = Math.max(yMax, q[1]); }
    if (Math.hypot(xMax - xMin, yMax - yMin) < 24) return null;

    const N = 96;
    const s = abtasten(p, N, true);
    const R = l / PI2;                         // Radius eines Kreises mit gleichem Umfang
    const richtung = (() => {                  // Drehsinn der gezeichneten Linie
      let f = 0;
      for (let i = 0; i < N; i++) { const a = s[i], b = s[(i + 1) % N]; f += a[0] * b[1] - b[0] * a[1]; }
      return f >= 0 ? 1 : -1;
    })();

    // Vieleck: kleinste Toleranz, bei der höchstens sechs Ecken bleiben
    let ec = null;
    for (const f of [0.02, 0.03, 0.045, 0.065, 0.09]) {
      const idx = bereinigeEcken(s, ecken(s, f * l), 0.07 * l);
      if (idx.length <= 6) { ec = idx; break; }
    }
    let vieleck = null, fehlerV = Infinity;
    if (ec && (ec.length === 3 || ec.length === 4)) {
      vieleck = verfeinere(s, ec, l);
      fehlerV = mittlererAbstandZuVieleck(s, vieleck) / R;
    }
    const e = passeEllipse(s);

    const ellipseGut = e.fehler <= ECKEN_TOLERANZ && e.b > 4;
    const vieleckGut = vieleck && fehlerV <= ECKEN_TOLERANZ;
    // Eckig gezeichnetes ist ein Vieleck, rund gezeichnetes eine Ellipse; im Zweifel gewinnt der kleinere Fehler
    let nimmVieleck = vieleckGut && (!ellipseGut || fehlerV <= e.fehler * 1.15);
    // Kein Dreieck oder Viereck: ein Vieleck mit fünf bis acht Ecken? (Sonst wäre hier ein Fünf- oder Sechseck zur Ellipse geworden)
    if (!nimmVieleck && e.b > 4) {
      const vp = erkenneVieleck(s, p, l, R, e);
      if (vp) return vp;
    }
    if (!nimmVieleck && !ellipseGut) return null;

    if (nimmVieleck) {
      if (vieleck.length === 3) {
        // flaches "Dreieck" (fast eine Linie) ist keins
        const fl = Math.abs((vieleck[1][0] - vieleck[0][0]) * (vieleck[2][1] - vieleck[0][1]) - (vieleck[1][1] - vieleck[0][1]) * (vieleck[2][0] - vieleck[0][0])) / 2;
        if (fl < 0.02 * l * l) return null;
        const gl = gleichseitig(vieleck);
        const v = gl || vieleck;
        return { art: 'dreieck', punkte: vieleckPunkte(v, naechsteEcke(v, p[0])) };
      }
      if (sindRechteWinkel(vieleck)) {
        const r = rechteck(vieleck);
        return { art: 'rechteck', quadrat: r.quadrat, punkte: vieleckPunkte(r.ecken, 0) };
      }
      return { art: 'viereck', punkte: vieleckPunkte(vieleck, naechsteEcke(vieleck, p[0])) };
    }

    // Ellipse oder Kreis
    const kreis = Math.max(e.a, e.b) / Math.min(e.a, e.b) <= 1.17;
    const el = kreis
      ? { cx: e.cx, cy: e.cy, a: (e.a + e.b) / 2, b: (e.a + e.b) / 2, w: 0 }
      : { cx: e.cx, cy: e.cy, a: e.a, b: e.b, w: rasterWinkel(e.w) };
    // Start dort, wo der Strich angefangen hat
    const co = Math.cos(el.w), si = Math.sin(el.w);
    const x = p[0][0] - el.cx, y = p[0][1] - el.cy;
    const t0 = Math.atan2((-x * si + y * co) / el.b, (x * co + y * si) / el.a);
    return { art: kreis ? 'kreis' : 'ellipse', punkte: ellipsePunkte(el, t0, richtung) };
  }

  /* ---------- Kritzeln: Zickzack über Geschriebenem ---------- */

  // Ist der Strich ein Zickzack (hin und her, viele scharfe Umkehrpunkte auf engem Raum)? Die Punkte sind in
  // Bildschirm-Pixeln (Koordinaten mal Zoom), damit es bei jedem Zoom gleich anspricht.
  function istKritzel(pixel) {
    const p = bereinige(pixel);
    if (p.length < 6) return false;
    const l = laenge(p);
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (const q of p) { xMin = Math.min(xMin, q[0]); xMax = Math.max(xMax, q[0]); yMin = Math.min(yMin, q[1]); yMax = Math.max(yMax, q[1]); }
    const diag = Math.hypot(xMax - xMin, yMax - yMin);
    if (l < 100 || diag < 24 || l < 3 * diag) return false;
    // Wichtige Punkte (Umkehrpunkte bleiben, kleines Zittern fällt weg)
    const keep = new Set([0, p.length - 1]);
    dp(p, 0, p.length - 1, 3, keep);
    const v = [...keep].sort((a, b) => a - b).map(i => p[i]);
    // Bahnen: die Stücke zwischen zwei scharfen Umkehrpunkten
    const bahnen = [];
    let anfang = v[0];
    for (let i = 1; i < v.length - 1; i++) {
      if (dist(v[i - 1], v[i]) < 6 || dist(v[i], v[i + 1]) < 6) continue;
      if (drehung(v[i - 1], v[i], v[i + 1]) > grad(100)) { bahnen.push([v[i][0] - anfang[0], v[i][1] - anfang[1]]); anfang = v[i]; }
    }
    bahnen.push([v[v.length - 1][0] - anfang[0], v[v.length - 1][1] - anfang[1]]);
    if (bahnen.length < 5) return false;
    // Hin und her entlang einer Richtung: die Bahnen zeigen abwechselnd zur einen und zur anderen Seite
    let sxx = 0, sxy = 0, syy = 0;
    for (const [x, y] of bahnen) { sxx += x * x; sxy += x * y; syy += y * y; }
    const w = 0.5 * Math.atan2(2 * sxy, sxx - syy), ax = Math.cos(w), ay = Math.sin(w);
    const proj = bahnen.map(([x, y]) => x * ax + y * ay);
    let wechsel = 0;
    for (let i = 1; i < proj.length; i++) if (proj[i] * proj[i - 1] < 0) wechsel++;
    const laengs = bahnen.filter(([x, y], i) => Math.abs(proj[i]) >= 0.5 * Math.hypot(x, y)).length;
    return wechsel >= 0.8 * (bahnen.length - 1) && laengs >= 0.8 * bahnen.length;
  }

  // Rechteck als Strich-Punkte (scharfe Ecken), z. B. für Seitenrahmen
  function rechteckPunkte(x, y, b, h) {
    return vieleckPunkte([[x, y], [x + b, y], [x + b, y + h], [x, y + h]], 0);
  }

  return { erkenne, istKritzel, laenge, abtasten, rechteckPunkte, spitzeAn };
});
