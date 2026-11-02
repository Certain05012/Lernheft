'use strict';
// Anmeldung (OAuth mit PKCE) für OneDrive und Dropbox, ohne Netz: Adresse der Anmeldeseite, Rückkehr, Token holen,
// erneuern, abgelaufen, getrennt gespeichert.
//   node test/anmeldung.js
const { pruefe, ende } = require('./hilfe');
const LHAnmeldung = require('../web/anmeldung.js');
const crypto = require('crypto');

function umgebung() {
  const speicher = new Map();
  const zustand = { hol: async k => speicher.get(k), setz: async (k, v) => { if (v === undefined) speicher.delete(k); else speicher.set(k, v); } };
  const posts = [];
  let antwort = () => ({ status: 200, json: { access_token: 'A1', refresh_token: 'R1', expires_in: 14400 } });
  const posteFormular = async (url, felder) => { posts.push({ url, felder }); return antwort(url, felder); };
  let geoeffnet = null;
  return { speicher, zustand, posts, posteFormular, oeffne: async url => { geoeffnet = url; }, geoeffnet: () => geoeffnet, setzeAntwort: f => { antwort = f; } };
}
const b64url = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

(async () => {
  for (const anbieter of ['onedrive', 'dropbox']) {
    const u = umgebung();
    const a = LHAnmeldung.erstelle({ anbieter, clientId: 'ID-' + anbieter, zurueck: 'ch.lernheft.app://auth', zustand: u.zustand, posteFormular: u.posteFormular, oeffne: u.oeffne });
    pruefe(`${anbieter}: am Anfang nicht angemeldet`, !(await a.angemeldet()));
    let fehlt = null;
    try { await a.token(); } catch (e) { fehlt = e; }
    pruefe(`${anbieter}: ohne Anmeldung -> anmelden`, fehlt && fehlt.anmelden, fehlt && fehlt.message);
    await a.anmelden();
    const url = new URL(u.geoeffnet());
    const q = url.searchParams;
    const erwartet = anbieter === 'dropbox' ? 'https://www.dropbox.com/oauth2/authorize' : 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
    pruefe(`${anbieter}: Anmeldeseite`, url.origin + url.pathname === erwartet, url.origin + url.pathname);
    pruefe(`${anbieter}: PKCE mit S256, Code, Rückkehr`, q.get('code_challenge_method') === 'S256' && q.get('response_type') === 'code' && q.get('redirect_uri') === 'ch.lernheft.app://auth' && q.get('client_id') === 'ID-' + anbieter);
    if (anbieter === 'dropbox') pruefe('dropbox: offline (Erneuerungstoken), ohne scope', q.get('token_access_type') === 'offline' && !q.has('scope') && !q.has('response_mode'));
    else pruefe('onedrive: scope und query', q.get('scope') === 'Files.ReadWrite offline_access' && q.get('response_mode') === 'query');

    // Rückkehr mit falschem state wird abgelehnt
    let falsch = null;
    try { await a.rueckkehr('ch.lernheft.app://auth?code=X&state=falsch'); } catch (e) { falsch = e; }
    pruefe(`${anbieter}: fremder state abgelehnt`, !!falsch);
    await a.anmelden();
    const q2 = new URL(u.geoeffnet()).searchParams;
    const offen = u.speicher.get('anmeldung-offen');
    pruefe(`${anbieter}: code_challenge = SHA-256 des verifier`, b64url(crypto.createHash('sha256').update(offen.verifier).digest()) === q2.get('code_challenge'));
    const ok = await a.rueckkehr(`ch.lernheft.app://auth?code=CODE1&state=${q2.get('state')}`);
    const post = u.posts[u.posts.length - 1];
    const tokenUrl = anbieter === 'dropbox' ? 'https://api.dropboxapi.com/oauth2/token' : 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
    pruefe(`${anbieter}: Code gegen Token getauscht`, ok && post.url === tokenUrl && post.felder.grant_type === 'authorization_code' && post.felder.code === 'CODE1' && post.felder.code_verifier === offen.verifier, post);
    pruefe(`${anbieter}: scope nur bei OneDrive`, anbieter === 'dropbox' ? !('scope' in post.felder) : post.felder.scope === 'Files.ReadWrite offline_access');
    pruefe(`${anbieter}: angemeldet, Token`, (await a.angemeldet()) && (await a.token()) === 'A1');
    const schluessel = anbieter === 'dropbox' ? 'anmeldung-dropbox' : 'anmeldung';
    pruefe(`${anbieter}: gespeichert unter ${schluessel}`, u.speicher.get(schluessel) && u.speicher.get(schluessel).refresh === 'R1' && [...u.speicher.keys()].filter(k => k.startsWith('anmeldung-') && k !== 'anmeldung-offen').length === (anbieter === 'dropbox' ? 1 : 0));

    // Erneuern: Dropbox schickt kein neues Erneuerungstoken mit, das alte bleibt
    u.setzeAntwort(() => ({ status: 200, json: { access_token: 'A2', expires_in: 14400 } }));
    pruefe(`${anbieter}: nach 401 neues Token`, (await a.token(true)) === 'A2' && u.posts[u.posts.length - 1].felder.grant_type === 'refresh_token' && u.posts[u.posts.length - 1].felder.refresh_token === 'R1');
    pruefe(`${anbieter}: Erneuerungstoken bleibt`, u.speicher.get(schluessel).refresh === 'R1');
    // Erneuerungstoken widerrufen
    u.setzeAntwort(() => ({ status: 400, json: { error: 'invalid_grant', error_description: 'refresh token is invalid' } }));
    let ab = null;
    try { await a.token(true); } catch (e) { ab = e; }
    pruefe(`${anbieter}: widerrufen -> neu anmelden (mit Namen der Cloud)`, ab && ab.anmelden && ab.message.includes(anbieter === 'dropbox' ? 'Dropbox' : 'OneDrive'), ab && ab.message);

    // Eine Anmeldung, die für die andere Cloud begonnen wurde, passt nicht
    const andere = LHAnmeldung.erstelle({ anbieter: anbieter === 'dropbox' ? 'onedrive' : 'dropbox', clientId: 'X', zurueck: 'ch.lernheft.app://auth', zustand: u.zustand, posteFormular: u.posteFormular, oeffne: u.oeffne });
    await a.anmelden();
    const st = new URL(u.geoeffnet()).searchParams.get('state');
    let quer = null;
    try { await andere.rueckkehr(`ch.lernheft.app://auth?code=C&state=${st}`); } catch (e) { quer = e; }
    pruefe(`${anbieter}: Rückkehr landet nicht bei der anderen Cloud`, !!quer);
  }

  // Web-App (Single-Page-App bei Microsoft): Erneuerungstoken gilt 24 Stunden, stille Anmeldung mit prompt=none
  {
    const u = umgebung();
    const a = LHAnmeldung.erstelle({ anbieter: 'onedrive', clientId: 'ID', zurueck: 'https://x.github.io/Lernheft/', zustand: u.zustand, posteFormular: u.posteFormular, oeffne: u.oeffne });
    u.setzeAntwort(() => ({ status: 200, json: { access_token: 'A1', refresh_token: 'R1', expires_in: 3600, refresh_token_expires_in: 86400 } }));
    await a.anmelden();
    let q = new URL(u.geoeffnet()).searchParams;
    pruefe('web: normale Anmeldung fragt nach dem Konto', q.get('prompt') === 'select_account' && q.get('redirect_uri') === 'https://x.github.io/Lernheft/');
    await a.rueckkehr(`https://x.github.io/Lernheft/?code=C&state=${q.get('state')}`);
    const ablauf = u.speicher.get('anmeldung').refreshAblauf;
    pruefe('web: Ablauf des Erneuerungstokens gemerkt (24 h)', Math.abs(ablauf - Date.now() - 86400e3) < 5000, ablauf);
    pruefe('web: läuft nicht in der nächsten Stunde ab', !(await a.laeuftAb(3600e3)));
    pruefe('web: läuft innerhalb eines Tages ab', await a.laeuftAb(25 * 3600e3));
    // Erneuern mit neuem Erneuerungstoken ohne Ablauf (iPad-App): kein Ablauf mehr
    u.setzeAntwort(() => ({ status: 200, json: { access_token: 'A2', expires_in: 3600 } }));
    await a.token(true);
    pruefe('web: Erneuern ohne neues Erneuerungstoken behält den Ablauf', u.speicher.get('anmeldung').refreshAblauf === ablauf);
    await a.anmelden('', true);
    q = new URL(u.geoeffnet()).searchParams;
    pruefe('web: stille Anmeldung mit prompt=none', q.get('prompt') === 'none' && u.speicher.get('anmeldung-offen').still === true);
    let still = null;
    try { await a.rueckkehr(`https://x.github.io/Lernheft/?error=login_required&error_description=Anmelden%20n%C3%B6tig&state=${q.get('state')}`); } catch (e) { still = e; }
    pruefe('web: stille Anmeldung ging nicht -> Fehler mit still', still && still.still === true, still && still.message);
    pruefe('web: Anmeldung bleibt dabei erhalten', u.speicher.get('anmeldung').refresh === 'R1');
    await a.anmelden();
    q = new URL(u.geoeffnet()).searchParams;
    let laut = null;
    try { await a.rueckkehr(`https://x.github.io/Lernheft/?error=server_error&state=${q.get('state')}`); } catch (e) { laut = e; }
    pruefe('web: Fehler einer normalen Anmeldung ist nicht still', laut && !laut.still);
    // iPad-App: Microsoft schickt dort keinen Ablauf mit
    const i = umgebung();
    const b = LHAnmeldung.erstelle({ anbieter: 'onedrive', clientId: 'ID', zurueck: 'ch.lernheft.app://auth', zustand: i.zustand, posteFormular: i.posteFormular, oeffne: i.oeffne });
    await b.anmelden();
    await b.rueckkehr(`ch.lernheft.app://auth?code=C&state=${new URL(i.geoeffnet()).searchParams.get('state')}`);
    pruefe('iPad-App: kein Ablauf bekannt -> läuft nie ab', !(await b.laeuftAb(365 * 86400e3)));
  }
  ende(process.argv[2]);
})().catch(e => { console.error(e); process.exit(1); });
