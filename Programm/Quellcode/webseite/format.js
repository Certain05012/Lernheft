'use strict';
// Dateiformat des Lernhefts (Version 2) und das Zusammenführen von Ständen verschiedener Geräte.
// Reines JavaScript ohne Node- oder Browser-Abhängigkeit: läuft in der App, im Browser und später auf einem iPad.
//
// Eine Seite (Handschrift) liegt als gzip-komprimiertes JSON in einer eigenen Datei (*.lhz):
//   { lh: 2, art: "seite", id, t, e: [ Element, ... ], x: { <Element-Id>: <gelöscht am, ms> } }
// Strich:  { i: Id, w: 0 Stift | 1 Marker, f: Farbe, d: Dicke, m: geändert am (ms),
//            q: [x0, y0, dx1, dy1, ...]   Zehntel-Pixel, ab dem zweiten Punkt als Differenz zum vorigen,
//            c: Code (alle Punkte gleich)  oder  r: [c0, dc1, ...] Differenzen,
//            Code = Druck (0..32) * 8 + Neigung (0..7) }
// Haftnotiz: { k: "n", i, x, y, b, h, f, t (Text), gr, erstellt, zu, m, e: [Striche auf der Notiz] }
// Bild:      { k: "b", i, x, y, b, h, src (data-URL, JPEG oder PNG), erstellt, m }
// Jedes Element hat eine Kennung (i) und einen Änderungszeitpunkt (m). Gelöschte Elemente bleiben als
// Grabstein in x. Daraus entsteht beim Zusammenführen zweier Stände (Cloud-Konfliktdatei) nie ein Verlust.
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.LHFormat = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  const VERSION = 2;
  const DRUCK_STUFEN = 32;
  const NEIGUNG_STUFEN = 7;
  const GRABSTEIN_TAGE = 180;

  const kurzId = () => Math.random().toString(36).slice(2, 10);
  const klemme = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rund2 = n => Math.round(n * 100) / 100;
  const istNotiz = e => e && (e.typ === 'notiz' || e.k === 'n');
  const istBild = e => e && (e.typ === 'bild' || e.k === 'b');

  /* ---------- Striche ---------- */

  function kodiereStrich(s) {
    const p = s.p || [];
    const q = new Array(p.length * 2);
    const codes = new Array(p.length);
    let px = 0, py = 0;
    for (let i = 0; i < p.length; i++) {
      const x = Math.round(p[i][0] * 10), y = Math.round(p[i][1] * 10);
      q[2 * i] = x - px; q[2 * i + 1] = y - py;
      px = x; py = y;
      const druck = p[i][2] == null ? 0.5 : p[i][2];
      codes[i] = Math.round(klemme(druck, 0, 1) * DRUCK_STUFEN) * 8 + Math.round(klemme(p[i][3] || 0, 0, 1) * NEIGUNG_STUFEN);
    }
    const o = { i: s.id, w: s.w === 'marker' ? 1 : 0, f: s.f, d: rund2(s.d) };
    if (s.m) o.m = s.m;
    o.q = q;
    if (codes.every(c => c === codes[0])) o.c = codes.length ? codes[0] : 0;
    else o.r = codes.map((c, i) => (i ? c - codes[i - 1] : c));
    return o;
  }

  function dekodiereStrich(o) {
    const n = Math.floor((o.q || []).length / 2);
    const p = new Array(n);
    let x = 0, y = 0, c = o.c || 0;
    for (let i = 0; i < n; i++) {
      x += o.q[2 * i]; y += o.q[2 * i + 1];
      if (o.r) c = i ? c + o.r[i] : o.r[0];
      const druck = (c >> 3) / DRUCK_STUFEN, neigung = (c & 7) / NEIGUNG_STUFEN;
      p[i] = neigung ? [x / 10, y / 10, druck, neigung] : [x / 10, y / 10, druck];
    }
    const s = { id: o.i || kurzId(), w: o.w === 1 ? 'marker' : 'stift', f: o.f, d: o.d, p };
    if (o.m) s.m = o.m;
    return s;
  }

  /* ---------- Punkte reduzieren ---------- */

  // Douglas-Peucker auf einem Strich [[x, y, druck, neigung?], ...]: Punkte, die auf der Verbindung der Nachbarn liegen,
  // fallen weg. Als Abweichung zählt der grösste von drei Fehlern, alle in Einheiten der Schreibfläche (px bei 100 %):
  //   Abstand zur Verbindung, Druckfehler (Druck ändert die Breite) und Neigungsfehler gegenüber dem Verlauf zwischen den
  //   Nachbarn. So bleibt jede sichtbare Änderung der Linie oder ihrer Breite erhalten. Anfang und Ende bleiben immer.
  // dicke: Dicke des Strichs, danach richtet sich die erlaubte Abweichung (eps, Standard 8 % der Dicke, mindestens 0,15).
  // mitDruck: false beim Textmarker, dessen Breite fest ist.
  function vereinfache(p, dicke, eps, mitDruck) {
    const n = p.length;
    if (n < 3) return p;
    const d = dicke > 0 ? dicke : 3;
    const grenze = eps > 0 ? eps : Math.max(0.15, 0.08 * d);
    const druckGewicht = mitDruck === false ? 0 : 0.6 * d, neigungGewicht = mitDruck === false ? 0 : d;
    const weg = new Float64Array(n);
    for (let i = 1; i < n; i++) weg[i] = weg[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    const bleibt = new Uint8Array(n);
    bleibt[0] = bleibt[n - 1] = 1;
    const stapel = [0, n - 1];
    while (stapel.length) {
      const b = stapel.pop(), a = stapel.pop();
      if (b - a < 2) continue;
      const pa = p[a], pb = p[b];
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1], l2 = dx * dx + dy * dy, lang = weg[b] - weg[a];
      const da = pa[2] == null ? 0.5 : pa[2], db = pb[2] == null ? 0.5 : pb[2], na = pa[3] || 0, nb = pb[3] || 0;
      let groesst = 0, ix = -1;
      for (let i = a + 1; i < b; i++) {
        const q = p[i];
        const t = l2 ? klemme(((q[0] - pa[0]) * dx + (q[1] - pa[1]) * dy) / l2, 0, 1) : 0;
        let fehler = Math.hypot(q[0] - (pa[0] + t * dx), q[1] - (pa[1] + t * dy));
        if (druckGewicht) {
          const s = lang ? (weg[i] - weg[a]) / lang : 0;
          fehler = Math.max(fehler,
            Math.abs((q[2] == null ? 0.5 : q[2]) - (da + (db - da) * s)) * druckGewicht,
            Math.abs((q[3] || 0) - (na + (nb - na) * s)) * neigungGewicht);
        }
        if (fehler > groesst) { groesst = fehler; ix = i; }
      }
      if (groesst > grenze) { bleibt[ix] = 1; stapel.push(a, ix, ix, b); }
    }
    const r = [];
    for (let i = 0; i < n; i++) if (bleibt[i]) r.push(p[i]);
    return r;
  }
  // Ein Strich-Objekt vereinfachen (verändert s.p); gibt s zurück
  function vereinfacheStrich(s) {
    if (s && Array.isArray(s.p)) s.p = vereinfache(s.p, s.w === 'marker' ? s.d * 4 : s.d, 0, s.w !== 'marker');
    return s;
  }

  /* ---------- Elemente und Seiten ---------- */

  function kodiereElement(e) {
    if (istBild(e)) { const { typ, id, ...rest } = e; return { k: 'b', i: id, ...rest }; }
    if (!istNotiz(e)) return kodiereStrich(e);
    const { typ, e: striche, id, ...rest } = e;
    const o = { k: 'n', i: id, ...rest };
    if (striche && striche.length) o.e = striche.map(kodiereStrich);
    return o;
  }
  function dekodiereElement(o) {
    if (o.k === 'b') { const { k, i, ...rest } = o; return { typ: 'bild', id: i || kurzId(), ...rest }; }
    if (o.k !== 'n') return dekodiereStrich(o);
    const { k, i, e: striche, ...rest } = o;
    const n = { typ: 'notiz', id: i || kurzId(), ...rest };
    if (striche && striche.length) n.e = striche.map(dekodiereStrich);
    return n;
  }

  // Seite im Speicher { e: [...], x: {...} } -> Text (JSON) für die Datei
  function kodiereSeite(id, inhalt, jetzt) {
    const o = { lh: VERSION, art: 'seite', id, t: jetzt || Date.now(), e: (inhalt.e || []).map(kodiereElement) };
    if (inhalt.x && Object.keys(inhalt.x).length) o.x = inhalt.x;
    return JSON.stringify(o);
  }
  // Text oder Objekt aus der Datei -> Seite im Speicher
  function dekodiereSeite(eingabe) {
    const o = typeof eingabe === 'string' ? JSON.parse(eingabe) : eingabe;
    if (!o || o.art !== 'seite' || !Array.isArray(o.e)) throw new Error('Keine Lernheft-Seite');
    if (o.lh > VERSION) throw new Error('Datei stammt aus einer neueren Lernheft-Version');
    const s = { e: o.e.map(dekodiereElement), x: Object.assign({}, o.x) };
    if (!Object.keys(s.x).length) delete s.x;
    return s;
  }

  // Elemente einer älteren Version (oder von Hand bearbeitet): Kennungen ergänzen
  function ergaenzeIds(liste) {
    const gesehen = new Set();
    for (const e of liste) {
      if (!e.id || gesehen.has(e.id)) e.id = kurzId();
      gesehen.add(e.id);
    }
    return liste;
  }

  /* ---------- Zusammenführen ---------- */

  const anzahlGrabsteine = x => (x ? Object.keys(x).length : 0);
  function grabsteineZusammen(a, b, jetzt) {
    const x = {};
    for (const quelle of [a, b]) for (const [id, t] of Object.entries(quelle || {})) x[id] = Math.max(x[id] || 0, t);
    const grenze = (jetzt || Date.now()) - GRABSTEIN_TAGE * 864e5;
    for (const id of Object.keys(x)) if (x[id] < grenze) delete x[id];
    return x;
  }

  // Zwei Stände derselben Seite: a ist der lokale (gewinnt bei Gleichstand), b der andere.
  // Ein Element gilt in der neueren Fassung. Ein Grabstein schlägt ein Element, das nicht jünger ist.
  function fuehreSeiteZusammen(a, b, jetzt) {
    const x = grabsteineZusammen(a.x, b.x, jetzt);
    const karte = new Map(), reihenfolge = [];
    const nimm = e => {
      const alt = karte.get(e.id);
      if (!alt) { karte.set(e.id, e); reihenfolge.push(e.id); }
      else if ((e.m || 0) > (alt.m || 0)) karte.set(e.id, e);
    };
    (a.e || []).forEach(nimm);
    (b.e || []).forEach(nimm);
    const e = [];
    for (const id of reihenfolge) {
      const el = karte.get(id);
      const weg = x[id];
      if (weg !== undefined && weg >= (el.m || 0)) continue;
      if (weg !== undefined) delete x[id];
      e.push(el);
    }
    const r = { e };
    if (anzahlGrabsteine(x)) r.x = x;
    return r;
  }

  // Sind zwei Stände inhaltlich gleich (gleiche Elemente in gleicher Fassung, gleiche Grabsteine)?
  function gleicheSeite(a, b) {
    const ea = a.e || [], eb = b.e || [];
    if (ea.length !== eb.length || anzahlGrabsteine(a.x) !== anzahlGrabsteine(b.x)) return false;
    const m = new Map(ea.map(e => [e.id, e.m || 0]));
    for (const e of eb) if (m.get(e.id) !== (e.m || 0)) return false;
    for (const [id, t] of Object.entries(a.x || {})) if ((b.x || {})[id] !== t) return false;
    return true;
  }

  const maxMap = (a, b) => {
    const r = Object.assign({}, a);
    for (const [k, v] of Object.entries(b || {})) r[k] = Math.max(r[k] || 0, v || 0);
    return r;
  };

  function fuehreStatistikZusammen(a, b) {
    a = a || {}; b = b || {};
    const r = Object.assign({}, b, a);
    for (const k of ['sekunden', 'sitzungen', 'zuletzt']) if (a[k] != null || b[k] != null) r[k] = Math.max(a[k] || 0, b[k] || 0);
    if (a.tage || b.tage) r.tage = maxMap(a.tage, b.tage);
    return r;
  }

  // Beschreibung eines Dokuments (Datei Handschrift.lernheft.json): die jüngere Fassung gilt,
  // Seiten und Lernzeit werden vereinigt
  function fuehreMetaZusammen(a, b) {
    const neuer = (b.geaendert || 0) > (a.geaendert || 0) ? b : a;
    const aelter = neuer === a ? b : a;
    const r = JSON.parse(JSON.stringify(neuer));
    r.eigenschaften = Object.assign({}, aelter.eigenschaften, neuer.eigenschaften);
    r.statistik = fuehreStatistikZusammen(neuer.statistik, aelter.statistik);
    r.seitenWeg = maxMap(a.seitenWeg, b.seitenWeg);
    if (Array.isArray(neuer.seiten) || Array.isArray(aelter.seiten)) {
      const liste = (neuer.seiten || []).slice();
      for (const id of aelter.seiten || []) if (!liste.includes(id)) liste.push(id);
      r.seiten = liste.filter(id => !r.seitenWeg[id]);
    }
    r.geaendert = Math.max(a.geaendert || 0, b.geaendert || 0);
    if (!Object.keys(r.seitenWeg).length) delete r.seitenWeg;
    return r;
  }

  // Synchronisierte Einstellungen: { <Schlüssel>: { v: Wert, m: geändert am } }, je Schlüssel gilt die jüngere
  function fuehreEinstellungenZusammen(a, b) {
    const r = Object.assign({}, b);
    for (const [k, e] of Object.entries(a || {})) if (!r[k] || (e.m || 0) >= (r[k].m || 0)) r[k] = e;
    return r;
  }

  // Fortschritt und Lernzeit (Daten\app-daten.json): Gelöstes und Zeiten vereinigen, sonst gilt a
  function fuehreAppDatenZusammen(a, b) {
    const r = Object.assign({}, b, a);
    if (a['mdt:geloest'] || b['mdt:geloest']) r['mdt:geloest'] = Object.assign({}, b['mdt:geloest'], a['mdt:geloest']);
    const tage = (x, y) => {
      const o = {};
      for (const quelle of [x, y]) for (const [tag, t] of Object.entries(quelle || {})) o[tag] = maxMap(o[tag], t);
      return o;
    };
    if (a['mdt:log'] || b['mdt:log']) r['mdt:log'] = tage(a['mdt:log'], b['mdt:log']);
    if (a['zeit:app'] || b['zeit:app']) r['zeit:app'] = { tage: tage((a['zeit:app'] || {}).tage, (b['zeit:app'] || {}).tage) };
    return r;
  }

  /* ---------- gzip im Browser (in Node stattdessen zlib) ---------- */

  async function ausStrom(strom) { return new Uint8Array(await new Response(strom).arrayBuffer()); }
  async function gzip(text) {
    return ausStrom(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip')));
  }
  async function gunzip(bytes) {
    const b = await ausStrom(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
    return new TextDecoder().decode(b);
  }

  return {
    VERSION, DRUCK_STUFEN, NEIGUNG_STUFEN, GRABSTEIN_TAGE,
    kodiereStrich, dekodiereStrich, kodiereSeite, dekodiereSeite, ergaenzeIds, vereinfache, vereinfacheStrich,
    fuehreSeiteZusammen, gleicheSeite, fuehreMetaZusammen, fuehreStatistikZusammen, fuehreEinstellungenZusammen, fuehreAppDatenZusammen,
    gzip, gunzip
  };
});
