'use strict';
// Nachbau der OneDrive-Schnittstelle (Microsoft Graph) für die Tests: nur das, was abgleich.js und onedrive.js
// benutzen, mit denselben Regeln (eTag/cTag, If-Match -> 412, conflictBehavior=fail -> 409, delta mit Seiten und
// Token, downloadUrl, Hochladen in Teilen). Dazu Hilfen, mit denen ein Test "den PC" spielt (Dateien direkt ändern).
// Auf denselben Dateien auch die Dropbox-Schnittstelle (API v2: list_folder mit Cursor, Gelöschtes nur mit Pfad,
// rev/content_hash, upload mit mode add/update und strict_conflict, Hochladen in Teilen), unter g.dropbox und
// g.dropboxInhalt.
//
//   const g = await starteAttrappe({ seite: 50 });   g.basis = 'http://127.0.0.1:<port>/v1.0'
//   node test/graph-attrappe.js [port]               als eigener Server (für den Test im Browser)
const http = require('http');

function starteAttrappe(opt = {}) {
  const seite = opt.seite || 200;
  let seq = 0, zaehler = 0;
  const items = new Map();
  const sitzungen = new Map();
  const protokoll = [];
  const stoerung = { offline: false, verloren: false, langsam: 0 };
  // Dropbox meldet Gelöschtes (und den alten Ort von Verschobenem) nur mit dem Pfad: hier gemerkt
  const wegLog = [];
  const neueId = () => 'I' + (++zaehler).toString(36).toUpperCase();
  const jetzt = () => new Date().toISOString();

  function neu(name, elternId, ordner, inhalt) {
    const it = { id: neueId(), name, elternId, ordner, inhalt: ordner ? null : Buffer.from(inhalt || ''), v: 1, c: 1, seq: ++seq, weg: false, zeit: jetzt() };
    items.set(it.id, it);
    return it;
  }
  const wurzel = neu('root', null, true);
  wurzel.istStamm = true;
  const kinder = id => [...items.values()].filter(i => !i.weg && i.elternId === id);
  const kind = (id, name) => kinder(id).find(i => i.name.toLowerCase() === name.toLowerCase());
  const pfadVon = it => { const t = []; let x = it; while (x && !x.istStamm) { t.unshift(x.name); x = items.get(x.elternId); } return x ? '/' + t.join('/') : null; };
  const etag = it => `"{${it.id}},${it.v}"`;
  const ctag = it => `"c:{${it.id}},${it.c}"`;
  const istUnter = (it, ordnerId) => { let x = it; while (x) { if (x.id === ordnerId) return true; if (x.weg) return false; x = items.get(x.elternId); } return false; };
  function geaendert(it, inhalt) { it.v++; if (inhalt) it.c++; it.seq = ++seq; it.zeit = jetzt(); }
  // Vor dem Verschieben oder Löschen: alten Pfad merken; nach dem Verschieben: alles darunter gilt als geändert
  // (Dropbox meldet nach dem Verschieben eines Ordners auch seinen Inhalt am neuen Ort)
  function vermerkeWeg(it) { const p = pfadVon(it); if (p) wegLog.push({ seq: ++seq, klein: p.toLowerCase(), anzeige: p, name: it.name }); }
  function auchDarunter(it) { for (const k of items.values()) if (k !== it && !k.weg && istUnter(k, it.id)) k.seq = ++seq; }

  let basisUrl = '';
  function alsJson(it) {
    const j = { id: it.id, name: it.name, eTag: etag(it), cTag: ctag(it), lastModifiedDateTime: it.zeit, size: it.ordner ? 0 : it.inhalt.length };
    if (!it.istStamm) j.parentReference = { id: it.elternId, path: '/drive/root:' + (pfadVon(items.get(it.elternId)) || '').replace(/^\/$/, '') };
    if (it.istStamm) j.root = {};
    if (it.ordner) j.folder = { childCount: kinder(it.id).length };
    else { j.file = { mimeType: 'application/octet-stream' }; j['@microsoft.graph.downloadUrl'] = `${basisUrl}/download/${it.id}?v=${it.c}`; }
    return j;
  }
  function nachPfad(startId, rel) {
    let x = items.get(startId);
    for (const t of rel.split('/').filter(Boolean)) { x = x && x.ordner ? kind(x.id, decodeURIComponent(t)) : null; if (!x) return null; }
    return x;
  }
  function legeOrdnerAn(startId, teile) {
    let x = items.get(startId);
    for (const t of teile) x = kind(x.id, t) || neu(t, x.id, true);
    return x;
  }

  /* ---- Hilfen für Tests: "der PC" ändert OneDrive direkt ---- */
  const pc = {
    schreibe(pfad, inhalt) {
      const teile = pfad.split('/').filter(Boolean), name = teile.pop();
      const eltern = legeOrdnerAn(wurzel.id, teile);
      const da = kind(eltern.id, name);
      if (da) { da.inhalt = Buffer.from(inhalt); geaendert(da, true); return da; }
      return neu(name, eltern.id, false, inhalt);
    },
    ordner(pfad) { return legeOrdnerAn(wurzel.id, pfad.split('/').filter(Boolean)); },
    lies(pfad) { const it = nachPfad(wurzel.id, pfad); return it && !it.ordner ? it.inhalt : null; },
    gibt(pfad) { return !!nachPfad(wurzel.id, pfad); },
    verschiebe(von, nach) {
      const it = nachPfad(wurzel.id, von);
      const teile = nach.split('/').filter(Boolean), name = teile.pop();
      vermerkeWeg(it);
      it.elternId = legeOrdnerAn(wurzel.id, teile).id; it.name = name;
      geaendert(it, false);
      auchDarunter(it);
    },
    loesche(pfad) { const it = nachPfad(wurzel.id, pfad); vermerkeWeg(it); it.weg = true; it.seq = ++seq; for (const k of [...items.values()]) if (!k.weg && istUnter(k, it.id) && k !== it) { k.weg = true; k.seq = ++seq; } },
    liste(unterPfad = '') {
      const start = unterPfad ? nachPfad(wurzel.id, unterPfad) : wurzel;
      return [...items.values()].filter(i => !i.weg && i !== start && istUnter(i, start.id)).map(i => pfadVon(i).slice(unterPfad ? unterPfad.length + 1 : 0).replace(/^\//, '') + (i.ordner ? '/' : '')).sort();
    }
  };

  /* ---- HTTP ---- */
  function antworte(res, status, koerper, kopf) {
    const h = Object.assign({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': '*' }, kopf || {});
    if (koerper !== undefined && !Buffer.isBuffer(koerper)) { h['Content-Type'] = 'application/json'; koerper = JSON.stringify(koerper); }
    res.writeHead(status, h);
    res.end(koerper);
  }
  const fehler = (res, status, code, text) => antworte(res, status, { error: { code, message: text || code } });

  const server = http.createServer((req, res) => {
    const teile = [];
    req.on('data', d => teile.push(d));
    req.on('end', () => setTimeout(() => { try { bearbeite(req, res, Buffer.concat(teile)); } catch (e) { console.error(e); fehler(res, 500, 'intern', e.message); } }, stoerung.langsam));
  });

  function bearbeite(req, res, koerper) {
    if (req.method === 'OPTIONS') return antworte(res, 204, undefined, { 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Max-Age': '600' });
    const url = new URL(req.url, 'http://x');
    const p = decodeURI(url.pathname);
    // Steuerung für den Browser-Test (anderer Prozess), geht auch "offline"
    if (p.startsWith('/_test/')) {
      const j = koerper.length ? JSON.parse(koerper.toString()) : {};
      const was = p.slice(7);
      if (was === 'schreibe') { pc.schreibe(j.pfad, Buffer.from(j.inhalt, 'base64')); return antworte(res, 200, { ok: true }); }
      if (was === 'lies') { const d = pc.lies(j.pfad); return antworte(res, 200, { inhalt: d ? d.toString('base64') : null }); }
      if (was === 'liste') return antworte(res, 200, pc.liste(j.pfad || ''));
      if (was === 'verschiebe') { pc.verschiebe(j.von, j.nach); return antworte(res, 200, { ok: true }); }
      if (was === 'loesche') { pc.loesche(j.pfad); return antworte(res, 200, { ok: true }); }
      if (was === 'stoerung') { Object.assign(stoerung, j); return antworte(res, 200, stoerung); }
      if (was === 'protokoll') return antworte(res, 200, protokoll.slice(-(j.n || 200)));
      return fehler(res, 404, 'unbekannt');
    }
    protokoll.push(req.method + ' ' + p + url.search);
    if (stoerung.offline) { res.socket.destroy(); return; }
    if (p.startsWith('/download/')) {
      const it = items.get(p.slice(10));
      if (!it || it.weg) return fehler(res, 404, 'itemNotFound');
      return antworte(res, 200, it.inhalt, { 'Content-Type': 'application/octet-stream' });
    }
    if (p.startsWith('/upload/')) return hochTeil(req, res, p.slice(8), koerper);
    if (p.startsWith('/dropbox')) return dropbox(req, res, p, koerper);
    if (!/^Bearer \S+/.test(req.headers.authorization || '')) return fehler(res, 401, 'InvalidAuthenticationToken');
    if (stoerung.verloren) { stoerung.verloren = false; return fehler(res, 401, 'InvalidAuthenticationToken'); }

    const r = p.replace(/^\/v1\.0/, '');
    if (r === '/me/drive' && req.method === 'GET') return antworte(res, 200, { id: 'laufwerk', driveType: 'personal', owner: { user: { displayName: 'Test Person' } }, quota: { total: 5e9, used: 1e6 } });
    if (r === '/me/drive/root' && req.method === 'GET') return antworte(res, 200, alsJson(wurzel));
    let m;
    if ((m = /^\/me\/drive\/root:\/(.+?)(:\/content)?$/.exec(r)) && req.method === 'GET') {
      const it = nachPfad(wurzel.id, m[1]);
      return it ? antworte(res, 200, alsJson(it)) : fehler(res, 404, 'itemNotFound');
    }
    // Pfad unter einem Element: /me/drive/items/{id}:/{pfad}[:/content | :/createUploadSession]
    if ((m = /^\/me\/drive\/items\/([^/:]+):\/(.+?)(?::\/(content|createUploadSession))?$/.exec(r))) {
      const [, startId, rel, wie] = m;
      const it = nachPfad(startId, rel);
      if (!wie && req.method === 'GET') return it ? antworte(res, 200, alsJson(it)) : fehler(res, 404, 'itemNotFound');
      if (wie === 'content' && req.method === 'PUT') {
        const verhalten = url.searchParams.get('@microsoft.graph.conflictBehavior') || 'replace';
        if (it && verhalten === 'fail') return fehler(res, 409, 'nameAlreadyExists');
        if (it) { it.inhalt = koerper; geaendert(it, true); return antworte(res, 200, alsJson(it)); }
        const t = rel.split('/').filter(Boolean).map(decodeURIComponent), name = t.pop();
        const eltern = legeOrdnerAn(startId, t);
        return antworte(res, 201, alsJson(neu(name, eltern.id, false, koerper)));
      }
      if (wie === 'createUploadSession' && req.method === 'POST') {
        const j = JSON.parse(koerper.toString() || '{}');
        if (it && j.item && j.item['@microsoft.graph.conflictBehavior'] === 'fail') return fehler(res, 409, 'nameAlreadyExists');
        const t = rel.split('/').filter(Boolean).map(decodeURIComponent);
        return neueSitzung(res, { startId, teile: t, id: it ? it.id : null });
      }
      return fehler(res, 400, 'nichtUnterstuetzt');
    }
    if ((m = /^\/me\/drive\/items\/([^/:]+)(\/[a-zA-Z]+)?$/.exec(r))) {
      const [, id, wie] = m;
      const it = items.get(id);
      if (wie === '/delta' && req.method === 'GET') return delta(res, it, url);
      if (!it || it.weg) return fehler(res, 404, 'itemNotFound');
      const ifMatch = req.headers['if-match'];
      if (ifMatch && ifMatch !== etag(it) && ifMatch !== ctag(it)) return fehler(res, 412, 'preconditionFailed');
      if (!wie && req.method === 'GET') return antworte(res, 200, alsJson(it));
      if (wie === '/content' && req.method === 'PUT') { it.inhalt = koerper; geaendert(it, true); return antworte(res, 200, alsJson(it)); }
      if (wie === '/createUploadSession' && req.method === 'POST') return neueSitzung(res, { id: it.id });
      if (wie === '/children' && req.method === 'POST') {
        const j = JSON.parse(koerper.toString());
        if (kind(it.id, j.name)) return fehler(res, 409, 'nameAlreadyExists');
        return antworte(res, 201, alsJson(neu(j.name, it.id, true)));
      }
      if (!wie && req.method === 'PATCH') {
        const j = JSON.parse(koerper.toString());
        const zielEltern = j.parentReference && j.parentReference.id ? items.get(j.parentReference.id) : items.get(it.elternId);
        if (!zielEltern || zielEltern.weg) return fehler(res, 404, 'itemNotFound');
        const name = j.name || it.name;
        const da = kind(zielEltern.id, name);
        if (da && da !== it) return fehler(res, 409, 'nameAlreadyExists');
        if (istUnter(zielEltern, it.id)) return fehler(res, 400, 'invalidRequest');
        vermerkeWeg(it);
        it.elternId = zielEltern.id; it.name = name;
        geaendert(it, false);
        auchDarunter(it);
        return antworte(res, 200, alsJson(it));
      }
      if (!wie && req.method === 'DELETE') { pc.loesche(pfadVon(it).slice(1)); return antworte(res, 204); }
    }
    return fehler(res, 400, 'nichtUnterstuetzt', req.method + ' ' + r);
  }

  function neueSitzung(res, ziel) {
    const s = 'S' + (++zaehler);
    sitzungen.set(s, Object.assign({ teile: [], daten: [] }, ziel));
    return antworte(res, 200, { uploadUrl: `${basisUrl}/upload/${s}`, expirationDateTime: jetzt() });
  }
  function hochTeil(req, res, s, koerper) {
    const sz = sitzungen.get(s);
    if (!sz) return fehler(res, 404, 'itemNotFound');
    const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(req.headers['content-range'] || '');
    if (!m) return fehler(res, 400, 'invalidRange');
    sz.daten.push(koerper);
    const bis = Number(m[2]), gesamt = Number(m[3]);
    if (bis + 1 < gesamt) return antworte(res, 202, { nextExpectedRanges: [`${bis + 1}-`] });
    const inhalt = Buffer.concat(sz.daten);
    sitzungen.delete(s);
    let it = sz.id ? items.get(sz.id) : null;
    if (it) { it.inhalt = inhalt; geaendert(it, true); return antworte(res, 200, alsJson(it)); }
    const t = sz.teile.slice(), name = t.pop();
    it = neu(name, legeOrdnerAn(sz.startId, t).id, false, inhalt);
    return antworte(res, 201, alsJson(it));
  }

  function delta(res, ordner, url) {
    if (!ordner || ordner.weg) return fehler(res, 404, 'itemNotFound');
    if (stoerung.deltaWeg) { stoerung.deltaWeg = false; if (url.searchParams.get('token')) return fehler(res, 410, 'resyncRequired'); }
    const ab = Number(url.searchParams.get('token') || 0);
    const voll = !url.searchParams.get('token');
    const bis = Number(url.searchParams.get('bis') || seq);
    const start = Number(url.searchParams.get('start') || 0);
    let liste = [...items.values()].filter(i => i.seq > ab && i.seq <= bis || (voll && !i.weg));
    liste = liste.filter(i => i === ordner || (voll ? !i.weg && istUnter(i, ordner.id) : true));
    // Eltern vor Kindern wie bei OneDrive
    const tiefe = i => { let n = 0, x = i; while (x && x.elternId) { n++; x = items.get(x.elternId); } return n; };
    liste.sort((a, b) => tiefe(a) - tiefe(b) || a.seq - b.seq);
    const werte = liste.slice(start, start + seite).map(i => {
      if (i.weg || (i !== ordner && !istUnter(i, ordner.id))) return { id: i.id, name: i.name, deleted: { state: 'deleted' }, parentReference: { id: i.elternId } };
      const j = alsJson(i);
      delete j.parentReference.path;   // wie bei OneDrive: delta liefert keinen Pfad
      return j;
    });
    const j = { value: werte };
    const q = `?token=${voll ? 0 : ab}&bis=${bis}${voll ? '&voll=1' : ''}`;
    if (start + seite < liste.length) j['@odata.nextLink'] = `${basisUrl}/v1.0/me/drive/items/${ordner.id}/delta${voll ? `?voll=1&bis=${bis}&start=${start + seite}` : `${q}&start=${start + seite}`}`;
    else j['@odata.deltaLink'] = `${basisUrl}/v1.0/me/drive/items/${ordner.id}/delta?token=${bis}`;
    return antworte(res, 200, j);
  }

  /* ---- Dropbox (API v2) ---- */
  const dbxSitzungen = new Map();
  const rev = it => it.id.toLowerCase() + '0' + it.v.toString(16);
  const dbxHash = it => 'h' + it.id + '-' + it.c;
  function alsDbx(it) {
    const p = pfadVon(it);
    const j = { '.tag': it.ordner ? 'folder' : 'file', name: it.name, id: 'id:' + it.id, path_lower: p.toLowerCase(), path_display: p };
    if (!it.ordner) Object.assign(j, { rev: rev(it), content_hash: dbxHash(it), size: it.inhalt.length, server_modified: it.zeit });
    return j;
  }
  function dbxFinde(pfad) {
    if (/^id:/.test(pfad)) { const it = items.get(pfad.slice(3)); return it && !it.weg ? it : null; }
    let x = wurzel;
    for (const t of String(pfad).split('/').filter(Boolean)) { x = x && x.ordner ? kind(x.id, t) : null; if (!x) return null; }
    return x;
  }
  const dbxFehler = (res, zusammenfassung) => antworte(res, 409, { error_summary: zusammenfassung + '..', error: { '.tag': zusammenfassung.split('/')[0] } });
  const ascii = j => JSON.stringify(j).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const tiefeVon = i => { let n = 0, x = i; while (x && x.elternId) { n++; x = items.get(x.elternId); } return n; };
  function dbxSchreibe(res, commit, inhalt) {
    const da = dbxFinde(commit.path);
    const art = typeof commit.mode === 'string' ? commit.mode : (commit.mode && commit.mode['.tag']) || 'add';
    if (da && da.ordner) return dbxFehler(res, 'path/conflict/folder/');
    if (art === 'add' && da) return dbxFehler(res, 'path/conflict/file/');
    if (art === 'update' && (!da || rev(da) !== commit.mode.update)) return dbxFehler(res, 'path/conflict/file/');
    if (da) { da.inhalt = inhalt; geaendert(da, true); return antworte(res, 200, alsDbx(da)); }
    const t = commit.path.split('/').filter(Boolean), name = t.pop();
    return antworte(res, 200, alsDbx(neu(name, legeOrdnerAn(wurzel.id, t).id, false, inhalt)));
  }
  // Liste: voll (alles unter dem Ordner, Eltern vor Kindern) oder Änderungen seit "ab" (in der Reihenfolge, in der sie
  // geschahen; Gelöschtes nur mit Pfad). Cursor: art|ordner|ab|bis|start (v = volle Liste, e = Änderungen, beim
  // Blättern; d = fertig, nächstes Mal ab bis)
  function dbxListe(res, art, startId, ab, bis, von) {
    const start = items.get(startId);
    if (!start || start.weg) return dbxFehler(res, 'path/not_found/');
    let liste;
    if (art === 'v') {
      liste = [...items.values()].filter(i => !i.weg && i.seq <= bis && (i === start || istUnter(i, start.id))).sort((a, b) => tiefeVon(a) - tiefeVon(b) || a.seq - b.seq).map(alsDbx);
    } else {
      const sp = pfadVon(start).toLowerCase();
      const lebend = [...items.values()].filter(i => !i.weg && i.seq > ab && i.seq <= bis && (i === start || istUnter(i, start.id))).map(i => ({ seq: i.seq, j: alsDbx(i) }));
      const weg = wegLog.filter(w => w.seq > ab && w.seq <= bis && (w.klein === sp || w.klein.startsWith(sp + '/'))).map(w => ({ seq: w.seq, j: { '.tag': 'deleted', name: w.name, path_lower: w.klein, path_display: w.anzeige } }));
      liste = lebend.concat(weg).sort((a, b) => a.seq - b.seq).map(x => x.j);
    }
    const entries = liste.slice(von, von + seite);
    const weiter = von + seite < liste.length;
    return antworte(res, 200, { entries, has_more: weiter, cursor: weiter ? `${art === 'v' ? 'v' : 'e'}|${startId}|${ab}|${bis}|${von + seite}` : `d|${startId}|${bis}|${bis}|0` });
  }
  function dropbox(req, res, p, koerper) {
    const inhaltsAufruf = p.startsWith('/dropbox-inhalt/');
    const route = p.replace(/^\/dropbox(-inhalt)?\/2\//, '');
    if (req.method !== 'POST') return antworte(res, 400, Buffer.from('nur POST'));
    if (!/^Bearer \S+/.test(req.headers.authorization || '')) return antworte(res, 401, { error_summary: 'invalid_access_token/', error: { '.tag': 'invalid_access_token' } });
    if (stoerung.verloren) { stoerung.verloren = false; return antworte(res, 401, { error_summary: 'expired_access_token/', error: { '.tag': 'expired_access_token' } }); }
    let arg;
    try { arg = inhaltsAufruf ? JSON.parse(req.headers['dropbox-api-arg'] || 'null') : JSON.parse(koerper.toString() || 'null'); }
    catch (e) { return antworte(res, 400, Buffer.from('Ungültiges JSON')); }
    arg = arg || {};
    // Im Protokoll auch den Pfad (für die Tests: was wurde hochgeladen, verschoben …)
    const ziel = arg.path || arg.from_path || (arg.commit && arg.commit.path) || '';
    if (ziel) protokoll[protokoll.length - 1] += ' ' + ziel;
    if (!inhaltsAufruf) {
      if (route === 'users/get_current_account') return antworte(res, 200, { account_id: 'dbid:test', name: { display_name: 'Test Person' }, email: 'test@example.com' });
      if (route === 'files/get_metadata') { const it = dbxFinde(arg.path); return it ? antworte(res, 200, alsDbx(it)) : dbxFehler(res, 'path/not_found/'); }
      if (route === 'files/create_folder_v2') {
        if (dbxFinde(arg.path)) return dbxFehler(res, 'path/conflict/folder/');
        return antworte(res, 200, { metadata: alsDbx(legeOrdnerAn(wurzel.id, arg.path.split('/').filter(Boolean))) });
      }
      if (route === 'files/list_folder') {
        const it = dbxFinde(arg.path);
        if (!it || !it.ordner) return dbxFehler(res, 'path/not_found/');
        return dbxListe(res, 'v', it.id, 0, seq, 0);
      }
      if (route === 'files/list_folder/continue') {
        const [art, startId, ab, bis, von] = String(arg.cursor || '').split('|');
        if (!startId) return antworte(res, 400, Buffer.from('cursor fehlt'));
        if (art === 'd' && stoerung.deltaWeg) { stoerung.deltaWeg = false; return dbxFehler(res, 'reset/'); }
        if (art === 'd') return dbxListe(res, 'd', startId, Number(ab), seq, 0);
        return dbxListe(res, art === 'v' ? 'v' : 'd', startId, Number(ab), Number(bis), Number(von));
      }
      if (route === 'files/move_v2') {
        const it = dbxFinde(arg.from_path);
        if (!it) return dbxFehler(res, 'from_lookup/not_found/');
        const t = arg.to_path.split('/').filter(Boolean), name = t.pop();
        const eltern = legeOrdnerAn(wurzel.id, t);
        const da = kind(eltern.id, name);
        if (da && da !== it) return dbxFehler(res, 'to/conflict/file/');
        if (istUnter(eltern, it.id)) return dbxFehler(res, 'to/cant_nest_shared_folder/');
        vermerkeWeg(it);
        it.elternId = eltern.id; it.name = name;
        geaendert(it, false);
        auchDarunter(it);
        return antworte(res, 200, { metadata: alsDbx(it) });
      }
      if (route === 'files/delete_v2') {
        const it = dbxFinde(arg.path);
        if (!it) return dbxFehler(res, 'path_lookup/not_found/');
        if (arg.parent_rev && (it.ordner || rev(it) !== arg.parent_rev)) return dbxFehler(res, 'path_write/conflict/file/');
        const md = alsDbx(it);
        pc.loesche(pfadVon(it).slice(1));
        return antworte(res, 200, { metadata: md });
      }
      return antworte(res, 400, Buffer.from('Unbekannter Aufruf ' + route));
    }
    if (route === 'files/download') {
      const it = dbxFinde(arg.path);
      if (!it || it.ordner) return dbxFehler(res, 'path/not_found/');
      return antworte(res, 200, it.inhalt, { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Result': ascii(alsDbx(it)) });
    }
    if (route === 'files/upload') return dbxSchreibe(res, arg, koerper);
    if (route === 'files/upload_session/start') {
      const id = 'dbs' + (++zaehler);
      dbxSitzungen.set(id, [koerper]);
      return antworte(res, 200, { session_id: id });
    }
    if (route === 'files/upload_session/append_v2' || route === 'files/upload_session/finish') {
      const teile = dbxSitzungen.get(arg.cursor && arg.cursor.session_id);
      if (!teile) return dbxFehler(res, 'lookup_failed/not_found/');
      const bisher = teile.reduce((n, b) => n + b.length, 0);
      if (bisher !== arg.cursor.offset) return dbxFehler(res, 'lookup_failed/incorrect_offset/');
      teile.push(koerper);
      if (route.endsWith('append_v2')) return antworte(res, 200, Buffer.from('null'), { 'Content-Type': 'application/json' });
      dbxSitzungen.delete(arg.cursor.session_id);
      return dbxSchreibe(res, arg.commit, Buffer.concat(teile));
    }
    return antworte(res, 400, Buffer.from('Unbekannter Aufruf ' + route));
  }

  return new Promise(ok => server.listen(opt.port || 0, '127.0.0.1', () => {
    basisUrl = `http://127.0.0.1:${server.address().port}`;
    ok({ basis: basisUrl + '/v1.0', url: basisUrl, dropbox: basisUrl + '/dropbox', dropboxInhalt: basisUrl + '/dropbox-inhalt', pc, stoerung, protokoll, items, schliesse: () => new Promise(r => server.close(r)) });
  }));
}

module.exports = { starteAttrappe };

if (require.main === module) {
  starteAttrappe({ port: Number(process.argv[2]) || 47831 }).then(g => console.log('Graph-Attrappe läuft auf ' + g.basis + ', Dropbox auf ' + g.dropbox));
}
