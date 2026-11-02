'use strict';
// Zugriff auf OneDrive über Microsoft Graph: Ordner lesen (delta), Dateien laden, hochladen, verschieben, löschen.
// Nur das, was der Abgleich braucht. Die Anmeldung (Token) kommt von aussen (anmeldung.js).
//
// Läuft im Browser (window.LHOneDrive) und in Node (Tests gegen eine nachgebaute Graph-Schnittstelle).
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.LHOneDrive = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  const KLEIN = 4 * 1024 * 1024;           // bis hier in einem Stück hochladen, darüber in Teilen
  const TEIL = 320 * 1024 * 12;            // 3,75 MB, ein Vielfaches von 320 KB (verlangt Graph)

  class GraphFehler extends Error {
    constructor(status, text, code) { super(`OneDrive ${status}${code ? ' ' + code : ''}: ${text || ''}`.trim()); this.status = status; this.code = code; }
  }
  // Kein Netz (fetch scheitert ganz): eigener Fehler, damit der Abgleich still wartet
  class OfflineFehler extends Error { constructor(e) { super('Keine Verbindung zu OneDrive'); this.ursache = e; this.offline = true; } }

  const kodierePfad = rel => rel.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const warte = ms => new Promise(r => setTimeout(r, ms));

  // basis: https://graph.microsoft.com/v1.0 ; token(neu): liefert ein gültiges Zugriffstoken (neu = true nach 401)
  function erstelle({ basis = 'https://graph.microsoft.com/v1.0', token, holen = (...a) => fetch(...a) }) {
    async function anfrage(methode, url, opt = {}) {
      const ziel = /^https?:/.test(url) ? url : basis + url;
      let neuesToken = false;
      for (let versuch = 0; ; versuch++) {
        const kopf = Object.assign({}, opt.kopf || {});
        if (!opt.ohneAnmeldung) {
          let t;
          try { t = await token(neuesToken); }
          catch (e) { if (!e.anmelden && (e instanceof TypeError || e.offline)) throw new OfflineFehler(e); throw e; }
          kopf.Authorization = 'Bearer ' + t;
        }
        let antwort;
        try { antwort = await holen(ziel, { method: methode, headers: kopf, body: opt.body }); }
        catch (e) { throw new OfflineFehler(e); }
        if (antwort.status === 401 && !opt.ohneAnmeldung && !neuesToken) { neuesToken = true; continue; }
        // Zu viele Anfragen oder Dienst kurz weg: warten und nochmal (höchstens 4 Mal)
        if ((antwort.status === 429 || antwort.status === 503 || antwort.status === 502 || antwort.status === 504) && versuch < 4) {
          const s = Number(antwort.headers.get('Retry-After')) || 2 ** versuch;
          await warte(Math.min(30, s) * 1000);
          continue;
        }
        if (!antwort.ok && !(opt.erlaubt || []).includes(antwort.status)) {
          let text = '', code;
          try { const j = await antwort.json(); code = j.error && j.error.code; text = j.error && j.error.message; } catch (e) { /* kein JSON */ }
          throw new GraphFehler(antwort.status, text, code);
        }
        return antwort;
      }
    }
    const json = async (methode, url, opt) => { const a = await anfrage(methode, url, opt); return a.status === 204 ? null : a.json(); };

    const api = {
      GraphFehler, OfflineFehler,
      laufwerk: () => json('GET', '/me/drive'),
      // Ordner oder Datei über den Pfad ab dem Stamm von OneDrive ("Lernheft"); null, wenn es ihn nicht gibt
      async nachPfad(rel) {
        const a = await anfrage('GET', '/me/drive/root:/' + kodierePfad(rel), { erlaubt: [404] });
        return a.status === 404 ? null : a.json();
      },
      // Unter einem Ordner (id) über einen relativen Pfad
      async unterPfad(ordnerId, rel) {
        const a = await anfrage('GET', `/me/drive/items/${ordnerId}:/${kodierePfad(rel)}`, { erlaubt: [404] });
        return a.status === 404 ? null : a.json();
      },
      element: id => json('GET', `/me/drive/items/${id}`),
      async ordnerAnlegen(elternId, name) {
        const a = await anfrage('POST', `/me/drive/items/${elternId}/children`, {
          kopf: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }), erlaubt: [409]
        });
        if (a.status !== 409) return a.json();
        // Gibt es schon (z. B. gerade vom anderen Gerät angelegt)
        return json('GET', `/me/drive/items/${elternId}:/${kodierePfad(name)}`);
      },
      async stammOrdnerAnlegen(name) {
        const stamm = await json('GET', '/me/drive/root');
        return api.ordnerAnlegen(stamm.id, name);
      },
      // Änderungen seit dem letzten Mal (link = deltaLink) oder alles (ohne link). Liefert { elemente, link, neu }:
      // neu = true, wenn OneDrive den alten Stand nicht mehr kennt (dann ist es eine vollständige Liste).
      async delta(ordnerId, link) {
        const elemente = [];
        let url = link || `/me/drive/items/${ordnerId}/delta`;
        let neu = !link;
        for (;;) {
          const a = await anfrage('GET', url, { erlaubt: [410] });
          if (a.status === 410) {
            if (neu) throw new GraphFehler(410, 'Änderungsliste nicht verfügbar');
            elemente.length = 0;
            url = `/me/drive/items/${ordnerId}/delta`;
            neu = true;
            continue;
          }
          const j = await a.json();
          elemente.push(...(j.value || []));
          if (j['@odata.nextLink']) { url = j['@odata.nextLink']; continue; }
          return { elemente, link: j['@odata.deltaLink'], neu };
        }
      },
      // Inhalt einer Datei. Der Browser darf der Umleitung von /content nicht folgen (CORS), deshalb über downloadUrl.
      async lade(idOderElement) {
        let el = typeof idOderElement === 'string' ? null : idOderElement;
        if (!el || !el['@microsoft.graph.downloadUrl']) el = await api.element(typeof idOderElement === 'string' ? idOderElement : idOderElement.id);
        const url = el['@microsoft.graph.downloadUrl'];
        if (!url) throw new GraphFehler(404, 'Kein Download für ' + el.name);
        const a = await anfrage('GET', url, { ohneAnmeldung: true });
        return { daten: new Uint8Array(await a.arrayBuffer()), element: el };
      },
      // Hochladen. ziel: { id, etag } (bestehende Datei, nur wenn sie noch so ist) oder { ordnerId, rel } (neu; schlägt
      // fehl, wenn es dort schon eine Datei gibt). Fehler 412 = inzwischen geändert, 409 = gibt es schon.
      async hoch(ziel, daten) {
        const bytes = daten instanceof Uint8Array ? daten : new Uint8Array(daten);
        const kopf = {};
        if (ziel.id && ziel.etag) kopf['If-Match'] = ziel.etag;
        if (bytes.byteLength <= KLEIN) {
          kopf['Content-Type'] = 'application/octet-stream';
          const url = ziel.id ? `/me/drive/items/${ziel.id}/content` : `/me/drive/items/${ziel.ordnerId}:/${kodierePfad(ziel.rel)}:/content?@microsoft.graph.conflictBehavior=fail`;
          return json('PUT', url, { kopf, body: bytes });
        }
        // Gross: in Teilen
        const url = ziel.id ? `/me/drive/items/${ziel.id}/createUploadSession` : `/me/drive/items/${ziel.ordnerId}:/${kodierePfad(ziel.rel)}:/createUploadSession`;
        kopf['Content-Type'] = 'application/json';
        const sitzung = await json('POST', url, { kopf, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': ziel.id ? 'replace' : 'fail' } }) });
        let ergebnis = null;
        for (let von = 0; von < bytes.byteLength; von += TEIL) {
          const bis = Math.min(bytes.byteLength, von + TEIL);
          const a = await anfrage('PUT', sitzung.uploadUrl, {
            ohneAnmeldung: true,
            kopf: { 'Content-Range': `bytes ${von}-${bis - 1}/${bytes.byteLength}`, 'Content-Type': 'application/octet-stream' },
            body: bytes.subarray(von, bis)
          });
          if (a.status === 200 || a.status === 201) ergebnis = await a.json();
        }
        return ergebnis;
      },
      verschiebe: (id, elternId, name) => json('PATCH', `/me/drive/items/${id}`, {
        kopf: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentReference: { id: elternId }, name, '@microsoft.graph.conflictBehavior': 'fail' })
      }),
      // In den Papierkorb von OneDrive. etag: nur, wenn die Datei noch so ist (sonst 412). 404 = schon weg (ok).
      async loesche(id, etag) {
        const kopf = etag ? { 'If-Match': etag } : {};
        await anfrage('DELETE', `/me/drive/items/${id}`, { kopf, erlaubt: [404] });
      }
    };
    return api;
  }

  return { erstelle, GraphFehler, OfflineFehler, kodierePfad };
});
