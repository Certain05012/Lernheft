'use strict';
// Abgleich zwischen dem Lernheft-Ordner auf dem iPad (Dateisystem im Arbeitsspeicher, knoten.js) und dem
// Lernheft-Ordner in OneDrive oder Dropbox (drive = onedrive.js oder dropbox.js, beide mit denselben Aufrufen; die
// Kommentare sprechen von OneDrive). Arbeitet wie der OneDrive-Client am PC, nur dass er die Dateien des Lernhefts kennt:
//
// - Herunter: OneDrive meldet über "delta" nur, was sich seit dem letzten Mal geändert hat. Alle geänderten Dateien
//   einer Runde werden erst vollständig geladen und dann auf einmal übernommen, damit die Ablage nie einen halben
//   Stand sieht (z. B. einen Skript-Ordner ohne seine Beschreibung). Danach liest die Ablage neu ein (fs.watch).
// - Hinauf: jede Änderung der Ablage (schreiben, umbenennen, löschen) wird gemerkt und hochgeladen. Hochgeladen wird
//   nur, wenn die Datei in OneDrive noch so ist, wie wir sie kannten (If-Match). Sonst ist sie inzwischen auf dem
//   PC geändert worden: dann kommt die Fassung aus OneDrive als Konfliktkopie daneben ("s1 (OneDrive).lhz"), die
//   Ablage führt beide zusammen (format.js) und der gemeinsame Stand wird hochgeladen. Es geht nichts verloren.
// - Grosse Dateien (PDFs) werden zuerst nur angelegt und im Hintergrund oder beim Öffnen geladen.
// - Gelöscht wird in OneDrive nie endgültig: was gelöscht wird, landet im Papierkorb von OneDrive.
//
// Was eine Datei braucht, wird aus dem gespeicherten Stand abgeleitet (Änderungszeit der Datei gegen die Zeit beim
// letzten Abgleich), nicht aus einer Liste, die bei einem Absturz verloren gehen könnte.
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.LHAbgleich = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  // Nie abgleichen: Sicherungen, die nur für dieses Gerät sind, und halb geschriebene Dateien
  const NUR_LOKAL = /(^|\/)[^/]*\.tmp$|^Daten\/(Sicherung-Seiten|Sicherung-Format1)(\/|$)/;
  // Hochladen ja, herunterladen nein (Konfliktkopien der anderen Geräte braucht das iPad nicht)
  const NICHT_LADEN = /^Daten\/Konflikte(\/|$)/;
  // Dateien, die die Ablage zusammenführen kann, wenn beide Seiten sie geändert haben
  const ZUSAMMENFUEHRBAR = /(\.lhz|(^|\/)Handschrift\.lernheft\.json|^Daten\/app-daten\.json|^Daten\/Einstellungen\.json)$/;
  const SPAETER_LADEN = /\.pdf$/i;
  const GLEICHZEITIG = 4;

  const dirname = p => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
  const basename = p => p.slice(p.lastIndexOf('/') + 1);
  const unter = (p, ordner) => p === ordner || p.startsWith(ordner + '/');
  const gleich = (a, b) => a.byteLength === b.byteLength && a.every((x, i) => x === b[i]);
  const stempel = () => new Date().toISOString().slice(0, 10);

  // fs: knoten.js; drive: onedrive.js oder dropbox.js; zustand: { hol(k), setz(k, v) } (speicher.js); lies(pfad): Inhalt
  // einer ausgelagerten Datei; lokal: Pfad des Lernheft-Ordners im fs ("/Lernheft"); ordner: Pfad in der Cloud
  // ("Lernheft"); name: Name der Cloud für Meldungen und Konfliktkopien ("OneDrive", "Dropbox"); melde(status): für die
  // Anzeige; sichern(): wartet, bis das Dateisystem gesichert ist
  function erstelle({ fs, drive, zustand, lies, sichern = async () => {}, lokal = '/Lernheft', ordner = 'Lernheft', name = 'OneDrive', melde = () => {}, protokoll = () => {} }) {
    // Der gespeicherte Stand gehört zu einer Cloud und einem Ordner (OneDrive und Dropbox haben andere Kennungen)
    const ZUSTAND = name === 'OneDrive' ? 'abgleich' : 'abgleich-' + name.toLowerCase();
    // ids: OneDrive-Kennung -> { p: Pfad relativ zum Lernheft-Ordner, d: Ordner, e: eTag, c: cTag, m: Änderungszeit
    //      der Datei auf dem iPad beim letzten Abgleich }
    let st = { wurzelId: null, link: null, ids: {}, ops: [] };
    let nachPfad = new Map();
    const hoch = new Set();           // Pfade, die hochgeladen werden müssen (Zwischenspeicher, wird neu berechnet)
    let status = { zustand: 'aus', text: '', offen: 0, zuletzt: 0, fehler: null };
    let laeuft = null, nochmal = false, timer = null, intervall = null, aktiv = false;
    let speichernTimer = null;
    const ladeSchlange = [];          // grosse Dateien, die im Hintergrund geladen werden
    // Pfad -> { kopie, seit }: Konfliktkopie liegt daneben, die Ablage hat noch nicht zusammengeführt. So lange
    // bleibt die Datei hier (sonst ginge kurz der Stand ohne die Änderungen des anderen Geräts hoch).
    const konfliktWartet = new Map();
    const wartetAufZusammenfuehren = rel => {
      const w = konfliktWartet.get(rel);
      if (!w) return false;
      if (fs.existsSync(absolut(w.kopie)) && Date.now() - w.seit < 120e3) return true;
      konfliktWartet.delete(rel);
      return false;
    };
    let lader = null;

    const absolut = rel => lokal + '/' + rel;
    const relativ = p => (p === lokal ? '' : p.startsWith(lokal + '/') ? p.slice(lokal.length + 1) : null);
    const knoten = rel => fs.knoten.get(absolut(rel));
    function baueIndex() { nachPfad = new Map(); for (const [id, e] of Object.entries(st.ids)) nachPfad.set(e.p, id); }
    const setzeId = (id, e) => { const alt = st.ids[id]; if (alt && nachPfad.get(alt.p) === id) nachPfad.delete(alt.p); st.ids[id] = e; nachPfad.set(e.p, id); };
    const entferneId = id => { const alt = st.ids[id]; if (!alt) return; if (nachPfad.get(alt.p) === id) nachPfad.delete(alt.p); delete st.ids[id]; };
    // Pfade unter einem verschobenen Ordner nachziehen
    function ziehePfadeNach(von, nach) {
      for (const [id, e] of Object.entries(st.ids)) if (unter(e.p, von)) setzeId(id, Object.assign({}, e, { p: nach + e.p.slice(von.length) }));
      for (const p of [...hoch]) if (unter(p, von)) { hoch.delete(p); hoch.add(nach + p.slice(von.length)); }
      for (const op of st.ops) if (op.art === 'verschiebe' && unter(op.nach, von)) op.nach = nach + op.nach.slice(von.length);
    }
    const wartetAufUns = id => st.ops.some(o => o.id === id);
    // Muss diese Datei hoch? (neu auf dem iPad oder seit dem letzten Abgleich geändert)
    function istGeaendert(rel) {
      const k = knoten(rel);
      if (!k || k.typ !== 'f' || NUR_LOKAL.test(rel)) return false;
      const id = nachPfad.get(rel);
      return !id || st.ids[id].m !== k.mtimeMs;
    }

    function setzeStatus(teil) {
      status = Object.assign({}, status, teil, { offen: hoch.size + st.ops.length + ladeSchlange.length });
      try { melde(status); } catch (e) { /* Anzeige */ }
    }
    function speichereZustand(sofort) {
      clearTimeout(speichernTimer);
      const jetzt = () => zustand.setz(ZUSTAND, { wurzelId: st.wurzelId, link: st.link, ids: st.ids, ops: st.ops, ordner }).catch(e => protokoll('Zustand speichern: ' + e.message));
      if (sofort) return jetzt();
      speichernTimer = setTimeout(jetzt, 300);
      return Promise.resolve();
    }

    /* ---------- Änderungen auf dem iPad merken ---------- */

    function lokaleAenderung(e) {
      if (e.quelle !== 'lokal') return;
      if (e.art === 'datei') {
        const rel = relativ(e.pfad);
        if (rel && !NUR_LOKAL.test(rel)) hoch.add(rel);
      } else if (e.art === 'weg') {
        const rel = relativ(e.pfad);
        if (rel === null || rel === '' || NUR_LOKAL.test(rel)) return;
        geloescht(rel, e.ordner);
      } else if (e.art === 'umbenannt') {
        const von = relativ(e.von), nach = relativ(e.nach);
        if (nach === null) { if (von) geloescht(von, e.ordner); }
        else if (von === null || NUR_LOKAL.test(von)) {
          // Neu an diesem Ort (z. B. eine fertig geschriebene .tmp-Datei)
          for (const q of fs.unter(e.nach)) { const r = relativ(q); if (r && fs.knoten.get(q).typ === 'f' && !NUR_LOKAL.test(r)) hoch.add(r); }
          if (!e.ordner && nachPfad.has(nach) && von === null) { /* überschrieben: wird hochgeladen */ }
        } else if (NUR_LOKAL.test(nach)) geloescht(von, e.ordner);
        else verschoben(von, nach, e.ordner);
      } else return;
      setzeStatus({});
      speichereZustand();
      plane(1500);
    }

    function geloescht(rel, ordnerArt) {
      const betroffen = Object.entries(st.ids).filter(([, e]) => unter(e.p, rel));
      const selbst = nachPfad.get(rel);
      if (selbst) {
        // Ein Ordner oder eine Datei, die OneDrive kennt: dort löschen (alles darunter geht mit)
        st.ops.push({ art: 'loesche', id: selbst, e: st.ids[selbst].d ? null : st.ids[selbst].e, p: rel });
        for (const [id] of betroffen) entferneId(id);
      } else {
        for (const [id, e] of betroffen) { if (!e.d) st.ops.push({ art: 'loesche', id, e: e.e, p: e.p }); entferneId(id); }
      }
      for (const p of [...hoch]) if (unter(p, rel)) hoch.delete(p);
      void ordnerArt;
    }

    function verschoben(von, nach, ordnerArt) {
      const id = nachPfad.get(von);
      // Wird etwas überschrieben, das OneDrive kennt? Dann die alte Datei dort löschen
      const ueber = nachPfad.get(nach);
      if (ueber && ueber !== id) { st.ops.push({ art: 'loesche', id: ueber, e: st.ids[ueber].d ? null : st.ids[ueber].e, p: nach }); entferneId(ueber); }
      if (id) {
        st.ops.push({ art: 'verschiebe', id, nach });
        ziehePfadeNach(von, nach);
      } else if (ordnerArt) {
        // Ordner, den OneDrive (noch) nicht kennt: die Dateien darin einzeln verschieben, Neues hochladen
        for (const [fid, e] of Object.entries(st.ids)) if (unter(e.p, von) && !e.d) st.ops.push({ art: 'verschiebe', id: fid, nach: nach + e.p.slice(von.length) });
        ziehePfadeNach(von, nach);
        for (const q of fs.unter(absolut(nach))) { const r = relativ(q); if (fs.knoten.get(q).typ === 'f' && !nachPfad.has(r)) hoch.add(r); }
      } else {
        hoch.delete(von);
        hoch.add(nach);
      }
    }

    /* ---------- Herunter: Änderungen aus OneDrive ---------- */

    // Dropbox meldet Pfade statt Eltern-Kennungen, und Gelöschtes nur mit seinem Pfad. Hier bekommt Gelöschtes die
    // Kennung, die wir für diesen Pfad kennen. Taucht dieselbe Kennung in der Runde an einem anderen Ort wieder auf, ist
    // sie nur verschoben worden (Dropbox meldet ein Verschieben als "alter Pfad gelöscht" plus "neuer Pfad").
    function loeseNachPfad(elemente) {
      const lebend = new Set(elemente.filter(e => !e.deleted && e.id).map(e => e.id));
      const bekannt = new Map();
      for (const [id, e] of Object.entries(st.ids)) bekannt.set(e.p.toLowerCase(), id);
      const aus = [];
      for (const el of elemente) {
        if (!el.deleted || el.id) { aus.push(el); continue; }
        if (el.relKlein === '') { aus.push(Object.assign({}, el, { id: st.wurzelId })); continue; }
        const id = bekannt.get(el.relKlein);
        if (!id || lebend.has(id)) continue;
        aus.push(Object.assign({}, el, { id }));
      }
      return aus;
    }
    // Pfade, wenn die Elemente ihren Pfad mitbringen (Dropbox): der Name kommt vom Element, der Ordner darüber aus
    // derselben Runde oder aus dem bekannten Stand (so stimmt die Schreibweise auch nach einer Umbenennung des Ordners)
    function bestimmePfadeNachPfad(elemente) {
      const pfade = new Map();
      const bekannt = new Map();
      for (const e of Object.values(st.ids)) bekannt.set(e.p.toLowerCase(), e.p);
      const runde = new Map([['', '']]);
      for (const el of elemente) if (el.deleted && el.id && el.id !== st.wurzelId) pfade.set(el.id, null);
      const tiefe = el => el.relKlein.split('/').length;
      const lebende = elemente.filter(el => !el.deleted && el.id && el.id !== st.wurzelId && el.relKlein).sort((a, b) => tiefe(a) - tiefe(b));
      for (const el of lebende) {
        const elternKlein = dirname(el.relKlein);
        const eltern = runde.has(elternKlein) ? runde.get(elternKlein) : bekannt.has(elternKlein) ? bekannt.get(elternKlein) : dirname(el.relAnzeige || el.relKlein);
        const p = (eltern ? eltern + '/' : '') + el.name;
        pfade.set(el.id, p);
        runde.set(el.relKlein, p);
      }
      return pfade;
    }

    // Pfade der Elemente einer delta-Runde bestimmen (Eltern vor Kindern, auch über mehrere Ebenen)
    function bestimmePfade(elemente) {
      if (elemente.some(e => e.relKlein !== undefined)) return bestimmePfadeNachPfad(elemente);
      const neu = new Map(elemente.map(e => [e.id, e]));
      const pfade = new Map();
      const pfadVon = (id, tiefe = 0) => {
        if (id === st.wurzelId) return '';
        if (tiefe > 64) return null;
        if (pfade.has(id)) return pfade.get(id);
        const el = neu.get(id);
        if (!el) return st.ids[id] ? st.ids[id].p : undefined;   // unverändert: der bekannte Pfad
        if (el.deleted || !el.parentReference) { pfade.set(id, null); return null; }
        const eltern = pfadVon(el.parentReference.id, tiefe + 1);
        const p = eltern === undefined || eltern === null ? null : (eltern ? eltern + '/' : '') + el.name;
        pfade.set(id, p);
        return p;
      };
      for (const el of elemente) if (el.id !== st.wurzelId) pfadVon(el.id);
      return pfade;
    }

    async function herunter() {
      if (!st.wurzelId) throw new Error(`Kein Ordner in ${name} gewählt`);
      const roh = await drive.delta(st.wurzelId, st.link);
      const { link, neu } = roh;
      const elemente = roh.elemente.some(e => e.relKlein !== undefined) ? loeseNachPfad(roh.elemente) : roh.elemente;
      const wurzelEl = elemente.find(e => e.id === st.wurzelId);
      if (wurzelEl && wurzelEl.deleted) throw Object.assign(new Error(`Der Ordner „${ordner}“ wurde in ${name} gelöscht.`), { wurzelWeg: true });
      const pfade = bestimmePfade(elemente);
      const vonEl = new Map(elemente.map(e => [e.id, e]));
      // Vollständige Liste: was wir kennen, aber nicht mehr darin steht, ist in OneDrive gelöscht
      if (neu) for (const id of Object.keys(st.ids)) if (!pfade.has(id)) pfade.set(id, null);

      const geaenderteLokal = [];
      const ladenListe = [];

      // 1. Verschoben oder umbenannt (Ordner zuerst, oben vor unten)
      const umzuege = [];
      for (const [id, p] of pfade) {
        const alt = st.ids[id];
        if (!alt || p === null || p === alt.p || wartetAufUns(id)) continue;
        umzuege.push([id, alt.p, p, !!alt.d]);
      }
      umzuege.sort((a, b) => (b[3] - a[3]) || a[1].split('/').length - b[1].split('/').length);
      for (const [id, , p, istOrdner] of umzuege) {
        const von = st.ids[id].p;   // kann sich durch einen früheren Umzug (Eltern) schon geändert haben
        if (von === p) continue;
        const a = absolut(von), b = absolut(p);
        if (fs.existsSync(a) && !fs.existsSync(b) && !NUR_LOKAL.test(p)) {
          fs.alsQuelle('wolke', () => { fs.mkdirSync(absolut(dirname(p)), { recursive: true }); fs.renameSync(a, b); });
          geaenderteLokal.push(a, b);
        }
        if (istOrdner) ziehePfadeNach(von, p); else { setzeId(id, Object.assign({}, st.ids[id], { p })); if (hoch.has(von)) { hoch.delete(von); hoch.add(p); } }
      }

      // 2. Gelöscht (oder aus dem Lernheft-Ordner hinaus verschoben)
      const weg = [...pfade].filter(([id, p]) => p === null && st.ids[id] && !wartetAufUns(id)).map(([id]) => id);
      weg.sort((a, b) => st.ids[a].p.split('/').length - st.ids[b].p.split('/').length);
      for (const id of weg) {
        const e = st.ids[id];
        if (!e) continue;   // schon mit dem Eltern-Ordner erledigt
        if (e.d) {
          const offen = [...hoch].filter(p => unter(p, e.p)).concat(Object.values(st.ids).filter(x => !x.d && unter(x.p, e.p) && istGeaendert(x.p)).map(x => x.p));
          if (offen.length) {
            // Darin gibt es Ungespeichertes vom iPad: nichts löschen, alles wird wieder hochgeladen
            for (const [fid, x] of Object.entries(st.ids)) if (unter(x.p, e.p)) entferneId(fid);
            for (const q of fs.unter(absolut(e.p))) { const r = relativ(q); if (fs.knoten.get(q).typ === 'f' && !NUR_LOKAL.test(r)) hoch.add(r); }
            continue;
          }
          for (const [fid, x] of Object.entries(st.ids)) if (unter(x.p, e.p)) entferneId(fid);
          if (fs.existsSync(absolut(e.p)) && !NUR_LOKAL.test(e.p)) { fs.alsQuelle('wolke', () => fs.rmSync(absolut(e.p), { recursive: true, force: true })); geaenderteLokal.push(absolut(e.p)); }
        } else {
          entferneId(id);
          if (istGeaendertOhneId(e)) { hoch.add(e.p); continue; }   // auf dem iPad geändert: bleibt und geht wieder hoch
          if (fs.existsSync(absolut(e.p))) { fs.alsQuelle('wolke', () => fs.rmSync(absolut(e.p), { force: true })); geaenderteLokal.push(absolut(e.p)); }
        }
      }

      // 3. Neu oder geändert: Ordner anlegen, Dateien laden
      const ordnerNeu = [];
      for (const [id, p] of pfade) {
        if (p === null) continue;
        const el = vonEl.get(id);
        if (!el || el.deleted) continue;
        if (el.folder) {
          if (wartetAufUns(id)) continue;
          if (!st.ids[id]) setzeId(id, { p, d: true });
          if (!NUR_LOKAL.test(p) && !NICHT_LADEN.test(p)) ordnerNeu.push(p);
          continue;
        }
        if (!el.file) continue;
        if (NUR_LOKAL.test(p) || NICHT_LADEN.test(p)) continue;
        const bekannt = st.ids[id];
        if (bekannt && bekannt.c === el.cTag && fs.existsSync(absolut(p))) {
          if (bekannt.e !== el.eTag) setzeId(id, Object.assign({}, bekannt, { e: el.eTag }));
          continue;
        }
        if (wartetAufUns(id)) continue;
        ladenListe.push({ id, p, el });
      }

      // Inhalte laden (kleine Dateien jetzt, PDFs später)
      const geladen = new Map();
      let fertig = 0;
      // PDFs später, ausser beide Seiten haben sie geändert (dann wird die Fassung aus OneDrive aufgehoben)
      const zuLaden = ladenListe.filter(x => !SPAETER_LADEN.test(x.p) || (fs.existsSync(absolut(x.p)) && istGeaendert(x.p)));
      setzeStatus({ zustand: 'laeuft', text: zuLaden.length ? `Lade 0 von ${zuLaden.length} Dateien …` : 'Abgleich …' });
      await parallel(zuLaden, async x => {
        geladen.set(x.id, (await drive.lade(x.el)).daten);
        fertig++;
        if (zuLaden.length > 3) setzeStatus({ text: `Lade ${fertig} von ${zuLaden.length} Dateien …` });
      });

      // 4. Alles auf einmal übernehmen (synchron, die Ablage sieht keinen halben Stand)
      const konflikte = [];
      fs.alsQuelle('wolke', () => {
        for (const p of ordnerNeu.sort((a, b) => a.length - b.length)) if (!fs.existsSync(absolut(p))) { fs.mkdirSync(absolut(p), { recursive: true }); geaenderteLokal.push(absolut(p)); }
        for (const x of ladenListe) {
          const ziel = absolut(x.p);
          fs.mkdirSync(absolut(dirname(x.p)), { recursive: true });
          const daten = geladen.get(x.id);
          const lokalDa = fs.existsSync(ziel);
          const geaendert = lokalDa && istGeaendert(x.p);
          if (geaendert) {
            konflikte.push(x);
            uebernimmKonflikt(x.p, x.el, daten);
          } else if (!daten) {
            fs.legeAnOhneInhalt(ziel, x.el.size || 0, { quelleId: x.id });
            setzeId(x.id, { p: x.p, e: x.el.eTag, c: x.el.cTag, m: fs.knoten.get(ziel).mtimeMs });
            if (sollImHintergrundLaden(x.p)) ladeSchlange.push(x.p);
          } else {
            fs.writeFileSync(ziel, daten);
            setzeId(x.id, { p: x.p, e: x.el.eTag, c: x.el.cTag, m: fs.knoten.get(ziel).mtimeMs });
            hoch.delete(x.p);
          }
          geaenderteLokal.push(ziel);
        }
      });
      st.link = link;
      if (geaenderteLokal.length) fs.meldeBeobachter(geaenderteLokal);
      return { geaendert: geaenderteLokal.length, konflikte: konflikte.length };
    }
    // Datei hatte eine Kennung, ist auf dem iPad aber seit dem Abgleich geändert worden
    function istGeaendertOhneId(e) { const k = knoten(e.p); return !!k && k.typ === 'f' && k.mtimeMs !== e.m; }

    // Beide Seiten haben die Datei geändert. Zusammenführbares: die Fassung aus OneDrive kommt als Kopie daneben, die
    // Ablage führt zusammen und schreibt den gemeinsamen Stand (der dann hochgeht). Sonst gilt die Fassung vom iPad,
    // die aus OneDrive wird unter Daten/Konflikte aufgehoben.
    function uebernimmKonflikt(rel, el, daten) {
      const vorhanden = daten && knoten(rel) && knoten(rel).daten;
      if (vorhanden && gleich(vorhanden, daten)) {
        setzeId(el.id, { p: rel, e: el.eTag, c: el.cTag, m: knoten(rel).mtimeMs });
        hoch.delete(rel);
        return;
      }
      setzeId(el.id, { p: rel, e: el.eTag, c: el.cTag, m: -1 });   // m = -1: bleibt "geändert", geht hoch
      hoch.add(rel);
      if (!daten) return;
      const punkt = rel.lastIndexOf('.');
      const stamm = punkt > rel.lastIndexOf('/') ? rel.slice(0, punkt) : rel, endung = punkt > rel.lastIndexOf('/') ? rel.slice(punkt) : '';
      let ziel;
      if (ZUSAMMENFUEHRBAR.test(rel)) {
        ziel = `${stamm} (${name})${endung}`;
        for (let i = 2; fs.existsSync(absolut(ziel)); i++) ziel = `${stamm} (${name} ${i})${endung}`;
      } else {
        ziel = `Daten/Konflikte/${stempel()}/${name}/${rel.replace(/\//g, ' - ')}`;
        fs.mkdirSync(absolut(dirname(ziel)), { recursive: true });
      }
      fs.writeFileSync(absolut(ziel), daten);
      if (ZUSAMMENFUEHRBAR.test(rel)) konfliktWartet.set(rel, { kopie: ziel, seit: Date.now() });
      protokoll(`Konflikt: ${rel} (beide geändert, wird zusammengeführt)`);
    }

    /* ---------- Hinauf: Änderungen vom iPad ---------- */

    // Ordner in OneDrive sicherstellen (relativer Pfad), liefert seine Kennung. Gleichzeitige Anfragen für denselben
    // Ordner (mehrere neue Dateien darin) teilen sich eine.
    const ordnerUnterwegs = new Map();
    async function ordnerId(rel) {
      if (!rel) return st.wurzelId;
      const id = nachPfad.get(rel);
      if (id && st.ids[id].d) return id;
      if (ordnerUnterwegs.has(rel)) return ordnerUnterwegs.get(rel);
      const neu = (async () => {
        const eltern = await ordnerId(dirname(rel));
        const el = await drive.ordnerAnlegen(eltern, basename(rel));
        setzeId(el.id, { p: rel, d: true });
        return el.id;
      })().finally(() => ordnerUnterwegs.delete(rel));
      ordnerUnterwegs.set(rel, neu);
      return neu;
    }

    async function fuehreOpAus(op) {
      if (op.art === 'loesche') {
        try { await drive.loesche(op.id, op.e); }
        catch (e) {
          // Inzwischen in OneDrive geändert: nicht löschen, die neue Fassung kommt beim nächsten Herunterladen
          // (vollständige Liste beim nächsten Mal, damit sie sicher wieder auftaucht)
          if (e.status === 412) { protokoll(`Nicht gelöscht, in ${name} geändert: ${op.p}`); st.link = null; return; }
          throw e;
        }
      } else if (op.art === 'verschiebe') {
        const e = st.ids[op.id];
        try {
          const elternId = await ordnerId(dirname(op.nach));
          const el = await drive.verschiebe(op.id, elternId, basename(op.nach));
          if (e) setzeId(op.id, Object.assign({}, e, { p: op.nach, e: el.eTag || e.e, c: el.cTag || e.c }));
        } catch (err) {
          if (err.status !== 404 && err.status !== 409) throw err;
          // In OneDrive weg oder Ziel besetzt: was hier liegt, wird neu hochgeladen
          protokoll(`Verschieben nicht möglich (${err.status}): ${op.nach}, wird neu hochgeladen`);
          for (const [fid, x] of Object.entries(st.ids)) if (fid === op.id || unter(x.p, op.nach)) entferneId(fid);
          for (const q of fs.unter(absolut(op.nach))) { const r = relativ(q); if (fs.knoten.get(q).typ === 'f' && !NUR_LOKAL.test(r)) hoch.add(r); }
          if (err.status === 409) st.ops.push({ art: 'loesche', id: op.id, e: null, p: '(alter Ort von) ' + op.nach });
        }
      }
    }

    async function inhaltVon(rel) {
      const k = knoten(rel);
      if (!k) return null;
      if (k.daten) return k.daten;
      if (k.inhalt) return lies(absolut(rel));
      if (k.fehlt && k.quelleId) return (await drive.lade(k.quelleId)).daten;
      return null;
    }

    async function ladeHoch(rel) {
      const k = knoten(rel);
      if (!k || k.typ !== 'f') { hoch.delete(rel); return; }
      const zeit = k.mtimeMs;
      const daten = await inhaltVon(rel);
      if (!daten) { hoch.delete(rel); return; }
      const id = nachPfad.get(rel);
      let el;
      try {
        // Neue Datei: ihren Ordner zuerst anlegen (und uns seine Kennung merken). Würde er nur nebenbei beim Hochladen
        // entstehen, kennten wir ihn nicht, und benennt der PC ihn um, bevor wir ihn sehen, bliebe hier ein leerer
        // Ordner unter dem alten Namen zurück.
        el = id ? await drive.hoch({ id, etag: st.ids[id].e }, daten) : await drive.hoch({ ordnerId: await ordnerId(dirname(rel)), rel: basename(rel) }, daten);
      } catch (e) {
        if (e.status !== 412 && e.status !== 409) throw e;
        // In OneDrive inzwischen geändert (412) oder dort schon vorhanden (409): die Fassung aus OneDrive holen
        const fremd = id && e.status === 412 ? await drive.element(id) : await drive.unterPfad(st.wurzelId, rel);
        if (!fremd) { if (id) entferneId(id); return; }
        const { daten: fremdDaten } = await drive.lade(fremd);
        fs.alsQuelle('wolke', () => uebernimmKonflikt(rel, fremd, fremdDaten));
        fs.meldeBeobachter([absolut(rel)]);
        return;
      }
      const jetzt = knoten(rel);
      setzeId(el.id, { p: rel, e: el.eTag, c: el.cTag, m: jetzt && jetzt.mtimeMs === zeit ? zeit : -1 });
      if (jetzt && jetzt.mtimeMs === zeit) hoch.delete(rel);
    }

    async function hinauf() {
      while (st.ops.length) {
        await fuehreOpAus(st.ops[0]);
        st.ops.shift();
        speichereZustand();
      }
      // Seiten zuerst (klein, wichtig), PDFs zuletzt
      const liste = [...hoch].filter(p => istGeaendert(p) && !wartetAufZusammenfuehren(p)).sort((a, b) => SPAETER_LADEN.test(a) - SPAETER_LADEN.test(b));
      for (const p of [...hoch]) if (!istGeaendert(p)) hoch.delete(p);
      let n = 0;
      await parallel(liste, async rel => {
        await ladeHoch(rel);
        n++;
        if (liste.length > 3) setzeStatus({ text: `Lade hoch: ${n} von ${liste.length} …` });
      });
      return liste.length;
    }

    /* ---------- Runden ---------- */

    // Beim Start: was auf dem iPad geändert oder gelöscht ist, aus dem gespeicherten Stand ableiten
    function pruefeLokal() {
      for (const q of fs.unter(lokal)) {
        const r = relativ(q);
        if (r && fs.knoten.get(q).typ === 'f' && istGeaendert(r)) hoch.add(r);
      }
      for (const [id, e] of Object.entries(st.ids)) {
        if (e.d || NUR_LOKAL.test(e.p) || NICHT_LADEN.test(e.p) || wartetAufUns(id)) continue;
        if (!fs.existsSync(absolut(e.p))) { st.ops.push({ art: 'loesche', id, e: e.e, p: e.p }); entferneId(id); }
      }
    }

    async function runde() {
      if (laeuft) { nochmal = true; return laeuft; }
      laeuft = (async () => {
        let durchgaenge = 0;
        do {
          nochmal = false;
          setzeStatus({ zustand: 'laeuft', text: 'Abgleich …', fehler: null });
          const r = await herunter();
          await sichern();
          await speichereZustand(true);
          const hochgeladen = await hinauf();
          await speichereZustand(true);
          if (r.konflikte) nochmal = true;   // die Ablage führt zusammen, dann geht der gemeinsame Stand hoch
          // Auf die Ablage warten, bis sie die Konfliktkopien zusammengeführt hat (höchstens 6 s)
          for (let i = 0; i < 30 && [...konfliktWartet.keys()].some(wartetAufZusammenfuehren); i++) await new Promise(ok => setTimeout(ok, 200));
          void hochgeladen;
        } while ((nochmal || [...hoch].some(p => !wartetAufZusammenfuehren(p))) && ++durchgaenge < 4);
        setzeStatus({ zustand: 'bereit', text: '', zuletzt: Date.now(), fehler: null });
        starteLader();
      })().catch(e => {
        if (e && e.offline) setzeStatus({ zustand: 'offline', text: 'Offline, wird später abgeglichen', fehler: null });
        else if (e && e.anmelden) setzeStatus({ zustand: 'anmelden', text: e.message, fehler: e.message });
        else { protokoll('Abgleich: ' + (e && e.message)); setzeStatus({ zustand: 'fehler', text: e && e.message ? e.message : String(e), fehler: e && e.message }); }
        if (e && e.wurzelWeg) aktiv = false;
      }).finally(() => { laeuft = null; speichereZustand(); });
      return laeuft;
    }

    function plane(ms) {
      if (!aktiv) return;
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; runde(); }, ms);
    }

    /* ---------- PDFs im Hintergrund oder beim Öffnen laden ---------- */

    // PDFs der Skripte (auch im Eingang), nicht die exportierten und nicht die im Papierkorb
    const sollImHintergrundLaden = rel => !/^Daten\/(Papierkorb|Konflikte)\//.test(rel) && !/\(mit (allen )?Notizen\)\.pdf$/i.test(rel);
    async function ladeDatei(rel) {
      const k = knoten(rel);
      if (!k || !k.fehlt || !k.quelleId) return k && k.daten ? k.daten : null;
      const { daten } = await drive.lade(k.quelleId);
      const jetzt = knoten(rel);
      if (jetzt && jetzt.fehlt) fs.fuelle(absolut(rel), daten);
      return daten;
    }
    function starteLader() {
      if (lader || !ladeSchlange.length || !aktiv) return;
      lader = (async () => {
        while (ladeSchlange.length && aktiv) {
          const rel = ladeSchlange[0];
          try { await ladeDatei(rel); ladeSchlange.shift(); setzeStatus({}); }
          catch (e) { if (e.offline) break; protokoll('PDF laden: ' + rel + ': ' + e.message); ladeSchlange.shift(); }
        }
      })().finally(() => { lader = null; });
    }

    async function parallel(liste, fn) {
      let i = 0;
      const arbeiter = Array.from({ length: Math.min(GLEICHZEITIG, liste.length) }, async () => { while (i < liste.length) await fn(liste[i++]); });
      await Promise.all(arbeiter);
    }

    fs.aufAenderung(lokaleAenderung);

    return {
      // Gespeicherten Stand laden; true, wenn schon einmal abgeglichen wurde
      async lade() {
        const s = await zustand.hol(ZUSTAND);
        if (s && s.ordner === ordner) st = Object.assign({ wurzelId: null, link: null, ids: {}, ops: [] }, s);
        baueIndex();
        pruefeLokal();
        for (const q of fs.unter(lokal)) { const k = fs.knoten.get(q); const r = relativ(q); if (k.typ === 'f' && k.fehlt && r && sollImHintergrundLaden(r)) ladeSchlange.push(r); }
        return !!st.link;
      },
      // Den Ordner in OneDrive festlegen (beim Einrichten). anlegen: fehlt er, wird er angelegt.
      async waehleOrdner(anlegen) {
        let el = await drive.nachPfad(ordner);
        if (!el && anlegen) el = await drive.stammOrdnerAnlegen(ordner);
        if (!el) return null;
        if (!el.folder) throw new Error(`„${ordner}“ in ${name} ist kein Ordner.`);
        if (st.wurzelId !== el.id) { st = { wurzelId: el.id, link: null, ids: {}, ops: [] }; baueIndex(); }
        await speichereZustand(true);
        return el;
      },
      runde,
      // Erster Abgleich vor dem Start der Ablage: alles herunterladen, nichts hochladen
      async ersteRunde() { const r = await herunter(); await sichern(); await speichereZustand(true); return r; },
      starte(alleMs = 30000) {
        aktiv = true;
        clearInterval(intervall);
        intervall = setInterval(() => { if (!laeuft) runde(); }, alleMs);
        plane(10);
      },
      halte() { aktiv = false; clearInterval(intervall); clearTimeout(timer); },
      jetzt: () => { aktiv = true; return runde(); },
      ladeDatei: p => ladeDatei(relativ(p)),
      status: () => status,
      offen: () => ({ hoch: [...hoch], ops: st.ops.slice(), laden: ladeSchlange.slice() }),
      _st: () => st
    };
  }

  return { erstelle, NUR_LOKAL, NICHT_LADEN };
});
