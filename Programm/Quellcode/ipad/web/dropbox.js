'use strict';
// Zugriff auf Dropbox (API v2): Ordner lesen (list_folder mit Cursor), Dateien laden, hochladen, verschieben, löschen.
// Bietet dieselben Aufrufe wie onedrive.js, damit abgleich.js mit beiden arbeitet. Die Elemente sehen aus wie die
// von OneDrive (id, name, eTag, cTag, size, file/folder, deleted), nur ohne parentReference: Dropbox meldet Pfade.
// Deshalb kommt jedes Element mit relKlein (Pfad ab dem Lernheft-Ordner, klein geschrieben, '' = der Ordner selbst)
// und relAnzeige (derselbe Pfad, wie er angezeigt wird). Gelöschtes meldet Dropbox nur mit Pfad, ohne Kennung: die
// Kennung sucht abgleich.js in seinem Stand.
//
//   eTag = rev (ändert sich bei jeder Änderung; Hochladen nur, wenn die Datei noch diese rev hat -> sonst 412)
//   cTag = content_hash (ändert sich nur, wenn sich der Inhalt ändert)
//
// Gelöschtes bleibt bei Dropbox eine Weile wiederherstellbar (Gelöschte Dateien, 30 Tage bei Basic).
// Die Anmeldung (Token) kommt von aussen (anmeldung.js).
//
// Läuft im Browser (window.LHDropbox) und in Node (Tests gegen eine nachgebaute Dropbox, test/graph-attrappe.js).
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.LHDropbox = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  const KLEIN = 8 * 1024 * 1024;           // bis hier in einem Stück hochladen (Dropbox erlaubt 150 MB), darüber in Teilen
  const TEIL = 8 * 1024 * 1024;            // Teilgrösse beim Hochladen in Teilen (Vielfaches von 4 MB)

  // Gleiche Fehlerklassen wie onedrive.js (status 404 = nicht da, 409 = gibt es schon, 412 = inzwischen geändert)
  class GraphFehler extends Error {
    constructor(status, text, code) { super(`Dropbox ${status}${code ? ' ' + code : ''}: ${text || ''}`.trim()); this.status = status; this.code = code; }
  }
  class OfflineFehler extends Error { constructor(e) { super('Keine Verbindung zu Dropbox'); this.ursache = e; this.offline = true; } }

  const warte = ms => new Promise(r => setTimeout(r, ms));
  // Der Kopf Dropbox-API-Arg darf nur ASCII enthalten: alles andere als \uXXXX
  const argKopf = arg => JSON.stringify(arg).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const verbinde = (basis, rel) => (basis.replace(/\/+$/, '') + '/' + String(rel).replace(/^\/+/, '')).replace(/\/+$/, '');

  // basis: https://api.dropboxapi.com ; inhalt: https://content.dropboxapi.com ; token(neu): gültiges Zugriffstoken
  function erstelle({ basis = 'https://api.dropboxapi.com', inhalt = 'https://content.dropboxapi.com', token, holen = (...a) => fetch(...a) }) {
    // Kennung -> Pfad (wie angezeigt), aus allem, was Dropbox uns gezeigt hat. Spart Nachfragen beim Hochladen.
    const pfade = new Map();
    const merke = md => { if (md && md.id && md.path_display) pfade.set(md.id, md.path_display); return md; };
    // Ein Ordner ist umgezogen: die gemerkten Pfade darunter mitziehen
    function zieheNach(von, nach) {
      const k = von.toLowerCase() + '/';
      for (const [id, p] of pfade) if (p.toLowerCase().startsWith(k)) pfade.set(id, nach + p.slice(von.length));
    }

    async function anfrage(url, opt) {
      let neuesToken = false;
      for (let versuch = 0; ; versuch++) {
        const kopf = Object.assign({}, opt.kopf || {});
        let t;
        try { t = await token(neuesToken); }
        catch (e) { if (!e.anmelden && (e instanceof TypeError || e.offline)) throw new OfflineFehler(e); throw e; }
        kopf.Authorization = 'Bearer ' + t;
        let antwort;
        try { antwort = await holen(url, { method: 'POST', headers: kopf, body: opt.body }); }
        catch (e) { throw new OfflineFehler(e); }
        if (antwort.status === 401 && !neuesToken) { neuesToken = true; continue; }
        // Zu viele Anfragen oder Dienst kurz weg: warten und nochmal (höchstens 4 Mal)
        if ((antwort.status === 429 || antwort.status >= 500) && versuch < 4) {
          const s = Number(antwort.headers.get('Retry-After')) || 2 ** versuch;
          await warte(Math.min(30, s) * 1000);
          continue;
        }
        if (!antwort.ok) {
          let text = '', zusammenfassung = '';
          try { text = await antwort.text(); const j = JSON.parse(text); zusammenfassung = j.error_summary || (j.error && j.error['.tag']) || ''; } catch (e) { /* kein JSON */ }
          // 409 = Fehler der Schnittstelle (Pfad fehlt, Konflikt …): in die Zahlen von OneDrive übersetzen
          let status = antwort.status;
          if (status === 409 && /not_found/.test(zusammenfassung)) status = 404;
          if (antwort.status === 401) throw Object.assign(new GraphFehler(401, 'Anmeldung ungültig', zusammenfassung), { anmelden: true });
          const f = new GraphFehler(status, zusammenfassung || text.slice(0, 200), zusammenfassung.split('/')[0]);
          f.zusammenfassung = zusammenfassung;
          throw f;
        }
        return antwort;
      }
    }
    // RPC-Aufruf (JSON hin, JSON zurück)
    async function rpc(route, arg) {
      const a = await anfrage(verbinde(basis, '2/' + route), {
        kopf: { 'Content-Type': 'application/json' }, body: JSON.stringify(arg === undefined ? null : arg)
      });
      const text = await a.text();
      return text ? JSON.parse(text) : null;
    }
    // Inhalt hochladen (Bytes hin, JSON zurück)
    async function hochAufruf(route, arg, bytes) {
      const a = await anfrage(verbinde(inhalt, '2/' + route), {
        kopf: { 'Dropbox-API-Arg': argKopf(arg), 'Content-Type': 'application/octet-stream' }, body: bytes
      });
      const text = await a.text();
      return text ? JSON.parse(text) : null;
    }
    const nichtDa = e => e && e.status === 404;
    const konflikt = e => e && e.status === 409 && /conflict/.test(e.zusammenfassung || '');

    // Metadaten von Dropbox -> Element wie bei OneDrive
    function alsElement(md) {
      merke(md);
      const el = { id: md.id, name: md.name, size: md.size || 0, pfad: md.path_display, pfadKlein: md.path_lower };
      if (md['.tag'] === 'folder') { el.folder = {}; el.eTag = null; el.cTag = null; }
      else { el.file = {}; el.eTag = md.rev; el.cTag = md.content_hash || md.rev; el.lastModifiedDateTime = md.server_modified; }
      return el;
    }
    async function metadaten(pfad) {
      try { return await rpc('files/get_metadata', { path: pfad }); }
      catch (e) { if (nichtDa(e)) return null; throw e; }
    }
    // Pfad einer Kennung (aus dem Gedächtnis, sonst bei Dropbox nachfragen)
    async function pfadVon(id, frisch) {
      if (!frisch && pfade.has(id)) return pfade.get(id);
      const md = await metadaten(id);
      if (!md) throw new GraphFehler(404, 'Nicht gefunden: ' + id, 'path');
      return merke(md).path_display;
    }

    const api = {
      GraphFehler, OfflineFehler,
      anbieter: 'dropbox',
      async laufwerk() {
        const k = await rpc('users/get_current_account');
        return { owner: { user: { displayName: (k && k.name && k.name.display_name) || (k && k.email) || '' } }, email: k && k.email };
      },
      // Ordner oder Datei über den Pfad ab dem Stamm von Dropbox ("Lernheft"); null, wenn es ihn nicht gibt
      async nachPfad(rel) {
        const md = await metadaten('/' + String(rel).replace(/^\/+|\/+$/g, ''));
        return md ? alsElement(md) : null;
      },
      // Unter einem Ordner (id) über einen relativen Pfad
      async unterPfad(ordnerId, rel) {
        const md = await metadaten(verbinde(await pfadVon(ordnerId), rel));
        return md ? alsElement(md) : null;
      },
      async element(id) {
        const md = await metadaten(id);
        if (!md) throw new GraphFehler(404, 'Nicht gefunden: ' + id, 'path');
        return alsElement(md);
      },
      async ordnerAnlegen(elternId, name) {
        const ziel = verbinde(await pfadVon(elternId), name);
        try { return alsElement((await rpc('files/create_folder_v2', { path: ziel, autorename: false })).metadata); }
        catch (e) {
          if (!konflikt(e)) throw e;
          // Gibt es schon (z. B. gerade vom anderen Gerät angelegt)
          const md = await metadaten(ziel);
          if (!md) throw e;
          return alsElement(md);
        }
      },
      async stammOrdnerAnlegen(name) {
        const ziel = '/' + String(name).replace(/^\/+|\/+$/g, '');
        try { return alsElement((await rpc('files/create_folder_v2', { path: ziel, autorename: false })).metadata); }
        catch (e) { if (!konflikt(e)) throw e; return alsElement(await metadaten(ziel)); }
      },
      // Änderungen seit dem letzten Mal (link = Cursor) oder alles (ohne link). Liefert { elemente, link, neu } wie
      // onedrive.js; neu = true: vollständige Liste (beim ersten Mal oder wenn Dropbox den Cursor nicht mehr kennt).
      async delta(ordnerId, link) {
        // Wo liegt der Lernheft-Ordner jetzt? (Am PC umbenannt oder gelöscht?)
        const wmd = await metadaten(ordnerId);
        if (!wmd || wmd['.tag'] !== 'folder') return { elemente: [{ id: ordnerId, name: '', deleted: {} }], link, neu: false };
        merke(wmd);
        const wurzelKlein = wmd.path_lower;
        const rel = p => {
          const k = String(p || '').toLowerCase();
          if (k === wurzelKlein) return '';
          return k.startsWith(wurzelKlein + '/') ? String(p).slice(wurzelKlein.length + 1) : null;
        };
        const roh = [];
        let neu = !link, j;
        if (link) {
          try { j = await rpc('files/list_folder/continue', { cursor: link }); }
          catch (e) {
            // reset: Dropbox kennt den alten Stand nicht mehr (oder der Ordner ist umgezogen): alles neu lesen
            if (e.status !== 409 && e.status !== 404) throw e;
            neu = true; j = null;
          }
        }
        if (!j) { neu = true; j = await rpc('files/list_folder', { path: ordnerId, recursive: true, include_deleted: false, include_mounted_folders: true }); }
        for (;;) {
          roh.push(...(j.entries || []));
          if (!j.has_more) break;
          j = await rpc('files/list_folder/continue', { cursor: j.cursor });
        }
        const elemente = [];
        for (const md of roh) {
          const r = rel(md.path_display || md.path_lower);
          if (r === null) continue;
          const rk = r.toLowerCase();
          if (md['.tag'] === 'deleted') {
            if (rk === '') elemente.push({ id: ordnerId, name: md.name, deleted: {} });
            else elemente.push({ name: md.name, deleted: {}, relKlein: rk, relAnzeige: r });
            continue;
          }
          const el = alsElement(md);
          el.relKlein = rk;
          el.relAnzeige = r;
          elemente.push(el);
        }
        return { elemente, link: j.cursor, neu };
      },
      // Inhalt einer Datei (Element oder Kennung)
      async lade(idOderElement) {
        const id = typeof idOderElement === 'string' ? idOderElement : idOderElement.id;
        const a = await anfrage(verbinde(inhalt, '2/files/download'), { kopf: { 'Dropbox-API-Arg': argKopf({ path: id }) } });
        let element = typeof idOderElement === 'string' ? null : idOderElement;
        try { const r = a.headers.get('Dropbox-API-Result'); if (r) element = alsElement(JSON.parse(r)); } catch (e) { /* ohne Kopf */ }
        return { daten: new Uint8Array(await a.arrayBuffer()), element };
      },
      // Hochladen. ziel: { id, etag } (bestehende Datei, nur wenn sie noch so ist) oder { ordnerId, rel } (neu; schlägt
      // fehl, wenn es dort schon eine Datei gibt). Fehler 412 = inzwischen geändert, 409 = gibt es schon.
      async hoch(ziel, daten) {
        const bytes = daten instanceof Uint8Array ? daten : new Uint8Array(daten);
        let pfad, mode;
        if (ziel.id) { pfad = await pfadVon(ziel.id); mode = ziel.etag ? { '.tag': 'update', update: ziel.etag } : { '.tag': 'overwrite' }; }
        else { pfad = verbinde(await pfadVon(ziel.ordnerId), ziel.rel); mode = { '.tag': 'add' }; }
        const lade = async commit => {
          if (bytes.byteLength <= KLEIN) return alsElement(await hochAufruf('files/upload', commit, bytes));
          // Gross: in Teilen
          const erstes = await hochAufruf('files/upload_session/start', { close: false }, bytes.subarray(0, TEIL));
          let von = Math.min(TEIL, bytes.byteLength);
          while (bytes.byteLength - von > TEIL) {
            await hochAufruf('files/upload_session/append_v2', { cursor: { session_id: erstes.session_id, offset: von }, close: false }, bytes.subarray(von, von + TEIL));
            von += TEIL;
          }
          return alsElement(await hochAufruf('files/upload_session/finish', { cursor: { session_id: erstes.session_id, offset: von }, commit }, bytes.subarray(von)));
        };
        try {
          try { return await lade({ path: pfad, mode, autorename: false, mute: true, strict_conflict: true }); }
          catch (e) {
            // Vielleicht liegt die Datei inzwischen woanders (Ordner umbenannt): einmal am aktuellen Ort versuchen
            if (!ziel.id || !konflikt(e)) throw e;
            const frisch = await pfadVon(ziel.id, true);
            if (frisch === pfad) throw e;
            return await lade({ path: frisch, mode, autorename: false, mute: true, strict_conflict: true });
          }
        } catch (e) {
          if (konflikt(e)) {
            // update: die rev stimmt nicht mehr = inzwischen geändert; add: es gibt dort schon eine Datei
            throw Object.assign(new GraphFehler(ziel.id ? 412 : 409, e.zusammenfassung, 'conflict'), { zusammenfassung: e.zusammenfassung });
          }
          throw e;
        }
      },
      async verschiebe(id, elternId, name) {
        const ziel = verbinde(await pfadVon(elternId), name);
        const alt = pfade.get(id);
        try {
          const el = alsElement((await rpc('files/move_v2', { from_path: id, to_path: ziel, autorename: false, allow_ownership_transfer: false })).metadata);
          if (alt && el.folder) zieheNach(alt, el.pfad);
          return el;
        }
        catch (e) {
          if (e.status === 409 && /^to\//.test(e.zusammenfassung || '')) throw Object.assign(new GraphFehler(409, e.zusammenfassung, 'conflict'), { zusammenfassung: e.zusammenfassung });
          throw e;
        }
      },
      // Löschen (bleibt bei Dropbox unter "Gelöschte Dateien" wiederherstellbar). etag: nur, wenn die Datei noch so
      // ist (sonst 412). Nicht da = schon weg (ok).
      async loesche(id, etag) {
        if (etag) {
          const md = await metadaten(id);
          if (!md) return;
          if (md['.tag'] === 'file' && md.rev !== etag) throw new GraphFehler(412, 'Inzwischen geändert', 'conflict');
        }
        try { await rpc('files/delete_v2', etag ? { path: id, parent_rev: etag } : { path: id }); pfade.delete(id); }
        catch (e) {
          if (nichtDa(e)) { pfade.delete(id); return; }
          if (etag && e.status === 409) throw new GraphFehler(412, e.zusammenfassung, 'conflict');
          throw e;
        }
      }
    };
    return api;
  }

  return { erstelle, GraphFehler, OfflineFehler, argKopf };
});
