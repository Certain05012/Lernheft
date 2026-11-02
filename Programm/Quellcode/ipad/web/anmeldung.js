'use strict';
// Anmeldung bei Microsoft für OneDrive oder bei Dropbox (OAuth 2.0 mit PKCE, ohne Geheimnis, ohne fremde Bibliothek).
// Beide arbeiten gleich; anbieter wählt Adressen und Berechtigungen (ANBIETER unten).
//
// iPad-App: die Anmeldeseite von Microsoft öffnet sich in Safari (in der App), danach springt Microsoft über die
// eigene Adresse ch.lernheft.app://auth zurück in die App. Das Token holt die App über die native HTTP-Verbindung
// von Capacitor (eine "mobile" App darf das, der Browser nicht). Die Anmeldung bleibt dann etwa 90 Tage gültig und
// verlängert sich bei jeder Benutzung.
// Im Browser (Web-App auf dem iPad, Test am PC): ganz normale Weiterleitung, zurück auf dieselbe Seite (Plattform
// "Single-Page-App"). Microsoft lässt das Erneuerungstoken dort nur 24 Stunden gelten; Dropbox nicht begrenzt.
//
// Gespeichert wird nur auf dem Gerät (IndexedDB der App): Zugriffs- und Erneuerungstoken, Name des Kontos.
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.LHAnmeldung = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  const AUTORITAET = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
  const BEREICH = 'Files.ReadWrite offline_access';
  // OneDrive: Konto "nur persönliche Microsoft-Konten". Dropbox: die Berechtigungen stehen in der App bei Dropbox
  // (files.metadata.read, files.content.read, files.content.write); token_access_type=offline liefert ein
  // Erneuerungstoken, das nicht abläuft. Gespeichert wird unter einem eigenen Schlüssel je Anbieter.
  const ANBIETER = {
    onedrive: {
      name: 'OneDrive', schluessel: 'anmeldung', authorize: AUTORITAET + '/authorize', token: AUTORITAET + '/token',
      anmeldeFelder: { response_mode: 'query', scope: BEREICH, prompt: 'select_account' }, tokenFelder: { scope: BEREICH }
    },
    dropbox: {
      name: 'Dropbox', schluessel: 'anmeldung-dropbox', authorize: 'https://www.dropbox.com/oauth2/authorize', token: 'https://api.dropboxapi.com/oauth2/token',
      anmeldeFelder: { token_access_type: 'offline' }, tokenFelder: {}
    }
  };

  class AnmeldungNoetig extends Error { constructor(t) { super(t || 'Bitte neu anmelden.'); this.anmelden = true; } }

  const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const zufall = n => { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; };

  // SHA-256, falls crypto.subtle fehlt (manche WebViews ohne "sicheren Kontext")
  function sha256(bytes) {
    const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const l = bytes.length, n = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(n); m.set(bytes); m[l] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
    const w = new Uint32Array(64), r = (x, s) => (x >>> s) | (x << (32 - s));
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) w[i] = (r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3)) + w[i - 16] + (r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10)) + w[i - 7];
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const aus = new Uint8Array(32), adv = new DataView(aus.buffer);
    H.forEach((x, i) => adv.setUint32(i * 4, x));
    return aus;
  }
  async function hash(text) {
    const bytes = new TextEncoder().encode(text);
    try { if (crypto.subtle) return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); } catch (e) { /* unten */ }
    return sha256(bytes);
  }

  // anbieter: 'onedrive' (Standard) oder 'dropbox'; clientId: Anwendungs-ID (Microsoft) bzw. App-Schlüssel (Dropbox);
  // zurueck: Weiterleitungsadresse; zustand: { hol, setz }; posteFormular(url, felder) -> { status, json } (iPad: native,
  // Browser: fetch); oeffne(url): Anmeldeseite zeigen
  function erstelle({ anbieter = 'onedrive', clientId, zurueck, zustand, posteFormular, oeffne }) {
    const A = ANBIETER[anbieter];
    if (!A) throw new Error('Unbekannter Anbieter: ' + anbieter);
    let gespeichert = null;
    let erneuern = null;

    async function lade() { if (!gespeichert) gespeichert = (await zustand.hol(A.schluessel)) || {}; return gespeichert; }
    async function speichere(a) { gespeichert = a; await zustand.setz(A.schluessel, a); }

    async function tokenAnfrage(felder) {
      const r = await posteFormular(A.token, Object.assign({ client_id: clientId }, A.tokenFelder, felder));
      const j = r.json || {};
      if (r.status >= 400 || !j.access_token) {
        const e = new Error(j.error_description ? j.error_description.split('\r\n')[0] : 'Anmeldung fehlgeschlagen (' + r.status + ')');
        e.code = j.error;
        throw e;
      }
      const a = await lade();
      // Web-App (Plattform "Single-Page-App" bei Microsoft): das Erneuerungstoken gilt nur 24 Stunden ab der Anmeldung
      // (refresh_token_expires_in), danach braucht es eine neue Anmeldung (die Web-App holt sie still, siehe bruecke.js)
      const neuesRefresh = !!j.refresh_token;
      await speichere(Object.assign({}, a, {
        access: j.access_token, refresh: j.refresh_token || a.refresh, ablauf: Date.now() + (j.expires_in || 3600) * 1000, clientId,
        refreshAblauf: neuesRefresh ? (j.refresh_token_expires_in ? Date.now() + j.refresh_token_expires_in * 1000 : null) : a.refreshAblauf
      }));
      return j.access_token;
    }

    return {
      AnmeldungNoetig,
      anbieter,
      name: A.name,
      async angemeldet() { const a = await lade(); return !!(a.refresh && a.clientId === clientId); },
      async konto() { return (await lade()).konto || null; },
      async setzeKonto(k) { await speichere(Object.assign({}, await lade(), { konto: k })); },
      // Startet die Anmeldung. Browser: verlässt die Seite (kommt mit ?code= zurück). iPad: oeffne() zeigt die Seite,
      // die Rückkehr kommt über rueckkehr(url).
      // still = true (nur OneDrive): ohne Rückfrage (prompt=none), klappt, solange man bei Microsoft noch angemeldet ist;
      // sonst kommt die Seite mit ?error=login_required o. ä. zurück.
      async anmelden(hinweis, still) {
        const verifier = b64url(zufall(32));
        const state = b64url(zufall(16));
        await zustand.setz('anmeldung-offen', { verifier, state, zurueck, anbieter, zeit: Date.now(), still: !!still });
        const q = new URLSearchParams(Object.assign({
          client_id: clientId, response_type: 'code', redirect_uri: zurueck,
          code_challenge: b64url(await hash(verifier)), code_challenge_method: 'S256', state
        }, A.anmeldeFelder));
        if (hinweis && anbieter === 'onedrive') q.set('login_hint', hinweis);
        if (still && anbieter === 'onedrive') q.set('prompt', 'none');
        await oeffne(A.authorize + '?' + q);
      },
      // Rückkehr von Microsoft bzw. Dropbox (Adresse mit ?code=…&state=… oder ?error=…). true = angemeldet.
      async rueckkehr(url) {
        const q = new URL(url).searchParams;
        const offen = await zustand.hol('anmeldung-offen');
        if (!q.get('code') && !q.get('error')) return false;
        await zustand.setz('anmeldung-offen', undefined);
        if (q.get('error')) {
          if (q.get('error') === 'access_denied') throw new Error('Anmeldung abgebrochen.');
          const e = new Error((q.get('error_description') || q.get('error')).split('\r\n')[0]);
          // Stille Anmeldung ging nicht (bei Microsoft abgemeldet): kein Fehler für die Anzeige, nur neu anmelden
          if (offen && offen.still) e.still = true;
          throw e;
        }
        if (!offen || offen.state !== q.get('state') || (offen.anbieter || 'onedrive') !== anbieter) throw new Error('Die Anmeldung passt nicht zu dieser Sitzung. Bitte noch einmal anmelden.');
        await tokenAnfrage({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: offen.zurueck, code_verifier: offen.verifier });
        return true;
      },
      // Gültiges Zugriffstoken (erneuert es bei Bedarf). neu = true: auf jeden Fall erneuern (nach 401).
      async token(neu) {
        const a = await lade();
        if (!a.refresh) throw new AnmeldungNoetig(`Bitte neu bei ${A.name} anmelden.`);
        if (!neu && a.access && a.ablauf - 120e3 > Date.now()) return a.access;
        if (!erneuern) {
          erneuern = tokenAnfrage({ grant_type: 'refresh_token', refresh_token: a.refresh }).catch(e => {
            if (e.code === 'invalid_grant' || e.code === 'interaction_required') throw new AnmeldungNoetig(`Die Anmeldung bei ${A.name} ist abgelaufen. Bitte neu anmelden.`);
            throw e;
          }).finally(() => { erneuern = null; });
        }
        return erneuern;
      },
      // Läuft das Erneuerungstoken in den nächsten ms Millisekunden ab (oder ist es schon abgelaufen)? Nur bekannt, wenn
      // der Anbieter ein Ablaufdatum mitschickt (Microsoft bei Single-Page-Apps).
      async laeuftAb(ms) { const a = await lade(); return !!(a.refresh && a.refreshAblauf && a.refreshAblauf - ms < Date.now()); },
      async abmelden() { await speichere({}); }
    };
  }

  return { erstelle, AnmeldungNoetig, sha256, ANBIETER };
});
