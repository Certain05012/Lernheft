# Lernheft als Web-App auf dem iPad (Dropbox, offline)

Die Web-App ist das Lernheft in Safari, ohne Mac und ohne Xcode. Sie hat dieselbe Oberfläche und dieselbe Bibliothek
wie am PC und gleicht über **Dropbox** mit dem PC ab (OneDrive geht auch, braucht aber ein Azure-Konto, siehe unten).
Sie läuft **auch ohne Netz**: alles liegt auf dem iPad, abgeglichen wird, sobald wieder Internet da ist. Schreiben iPad
und PC auf derselben Seite, werden beide Fassungen zusammengeführt.

Adresse: **<https://certain05012.github.io/Lernheft/>**

| | Web-App (diese Anleitung) | iPad-App ([Anleitung](../Programm/Quellcode/ipad/ANLEITUNG.md)) |
|---|---|---|
| Brauchst du einen Mac? | nein | ja (Xcode) |
| Abgleich mit dem PC | Dropbox oder OneDrive, automatisch | Dropbox oder OneDrive, automatisch |
| Offline | ja | ja |
| iCloud Drive | Sicherung als Datei, von Hand | Sicherung in einen Ordner, automatisch |
| Updates | kommen von selbst | neu bauen und installieren |

---

## Einmalig einrichten (etwa 15 Minuten)

Das Lernheft bekommt bei Dropbox einen **eigenen App-Ordner** (`Dropbox\Apps\<Name deiner App>`). Es sieht nur diesen
Ordner, nichts sonst in deiner Dropbox: keine Fotos, keine anderen Dateien. Das prüft Dropbox selbst bei jedem Zugriff,
nicht das Lernheft.

### 1. Lernheft bei Dropbox eintragen (am PC)

Damit sich die Web-App mit deinem Dropbox-Konto anmelden darf, braucht sie einen App-Schlüssel von Dropbox. Kostenlos,
ohne Kreditkarte.

1. Kostenloses Konto auf <https://www.dropbox.com> anlegen (falls noch keins) und
   [Dropbox für Windows](https://www.dropbox.com/install) installieren. Danach gibt es den Ordner `C:\Users\<Name>\Dropbox`.
2. <https://www.dropbox.com/developers/apps> öffnen, mit **deinem Dropbox-Konto** anmelden, **Create app**:
   - *Choose an API*: **Scoped access**
   - *Choose the type of access*: **App folder** (nur ein eigener Ordner, nicht „Full Dropbox“)
   - *Name your app*: z. B. `Lernheft-deinname` (der Name muss bei Dropbox einmalig sein; so heisst später auch der Ordner)
   - **Create app**
3. Reiter **Permissions**: `files.metadata.read`, `files.content.read` und `files.content.write` anhaken ›
   unten **Submit**. Mehr nicht (vor allem nichts mit `sharing`, `team` oder `account_info.write`).
4. Reiter **Settings**:
   - Bei **OAuth 2 › Redirect URIs** genau diese Adresse eintragen (mit `/` am Ende) und **Add**:
     ```
     https://certain05012.github.io/Lernheft/
     ```
     Weitere Adressen nicht eintragen: Dropbox schickt eine Anmeldung nur an eingetragene Adressen zurück.
   - **Allow public clients (Implicit Grant & PKCE)**: muss auf **Allow** stehen (Standard).
   - Den **App key** kopieren (z. B. `a1b2c3d4e5f6g7h`). Er ist kein Geheimnis. Das **App secret** brauchst du nicht,
     gib es nicht weiter.
5. Die App bleibt im Status *Development*, das reicht für dich; eine Freigabe durch Dropbox ist nicht nötig.

**Hast du schon eine App mit „Full Dropbox“?** Die Art des Zugriffs lässt sich bei Dropbox nachträglich nicht ändern. Lege
eine neue App wie oben an, melde das Lernheft auf dem iPad ab (Menü › Dropbox › Abmelden …) und richte es mit dem neuen
App key neu ein. Danach die alte App unter <https://www.dropbox.com/developers/apps> löschen (Settings › Delete app) und
unter <https://www.dropbox.com/account/connected_apps> nachsehen, dass sie dort nicht mehr steht. Den alten Ordner
`Dropbox\Lernheft` am PC behältst du, bis alles im neuen Ordner angekommen ist.

### 2. Reihenfolge, damit nichts durcheinanderkommt

Der App-Ordner entsteht erst, wenn du dich zum ersten Mal mit der App anmeldest. Deshalb:

1. **iPad:** Lernheft einrichten (siehe unten) bis „Mit Dropbox anmelden“. Danach meldet es „Ordner fehlt“. Dort
   **nicht** „Neu anlegen“ tippen, sondern warten.
2. **PC:** In `C:\Users\<Name>\Dropbox\Apps\` steht jetzt ein Ordner mit dem Namen deiner App. Im Lernheft am PC:
   **Menü › Speicherort** › darin einen neuen Ordner `Lernheft` anlegen und wählen
   (`Dropbox\Apps\<Name deiner App>\Lernheft`). Das Lernheft kopiert deine Bibliothek dorthin und startet neu. Warte,
   bis Dropbox fertig hochgeladen hat (grüner Haken am Ordner).
3. **iPad:** „Nochmal suchen“ tippen. Der erste Abgleich lädt die Bibliothek.

Für das Lernheft ist der App-Ordner die Wurzel: „Ordner in der Cloud“ bleibt `Lernheft`.

Der App key kann auch fest in `Programm/Quellcode/ipad/web/konfig.js` bei `dropboxAppKey` stehen, dann musst du ihn
auf dem iPad nicht eintippen.

---

## Auf dem iPad

1. **Safari** öffnen, <https://certain05012.github.io/Lernheft/> laden.
2. **Zuerst auf den Home-Bildschirm:** Teilen-Knopf (Quadrat mit Pfeil) › **Zum Home-Bildschirm** › Hinzufügen.
   Wichtig: Safari hält die Daten der App auf dem Home-Bildschirm getrennt von den Safari-Tabs. Richte das Lernheft
   deshalb erst in der App auf dem Home-Bildschirm ein, nicht im Safari-Tab.
3. Das Lernheft vom Home-Bildschirm starten.
4. **Erweitert** aufklappen, bei „Dropbox: App-Schlüssel“ den App key aus Schritt 1.4 eintragen (entfällt, wenn er in
   `konfig.js` steht). „Ordner in der Cloud“: `Lernheft`.
5. **Mit Dropbox anmelden** › Zugriff erlauben.
6. Der erste Abgleich lädt die Bibliothek. Die PDFs kommen danach im Hintergrund; lass die App dafür eine Weile offen
   (oder öffne die Skripte, die du offline brauchst, einmal).

Danach startet das Lernheft sofort, auch im Flugmodus. Die Anmeldung bei Dropbox bleibt dauerhaft gültig.

### Gut zu wissen

- **Abgleich:** solange die App offen ist alle 30 Sekunden und nach jeder Änderung, ausserdem beim Zurückkehren in die App.
  Stand, Version und „Jetzt abgleichen“: Menü › **Dropbox**.
- **Updates** kommen von selbst: Beim Öffnen sieht die App nach einer neuen Version, lädt sie im Hintergrund und startet
  sich nach wenigen Sekunden damit neu (vorher wird alles gesichert). Ist sie schon länger offen, übernimmt sie die
  neue Version, sobald du in die App zurückkehrst, oder über den Knopf „Neu laden“ im Hinweis. Welche Version läuft,
  steht im Menü › Dropbox.
- **Gesten:** zwei Finger tippen = Rückgängig, drei Finger tippen = Wiederholen, zwei Finger halten = Seiten-Menü (drehen, Gesten einstellen). Einstellbar im Stift-Panel › Gesten. Doppeltippen und Zusammendrücken am Apple Pencil gibt Safari nicht an Webseiten weiter, das geht nur in der iPad-App.
- **120 Hz:** Safari zeichnet Webseiten auf dem iPad sonst mit 60 Bildern pro Sekunde. Einstellungen › Apps › Safari › Erweitert › Feature Flags › „Prefer Page Rendering Updates near 60fps“ ausschalten, dann läuft das Lernheft auf iPads mit ProMotion mit 120.
- **Platz:** Dropbox Basic hat 2 GB. Notizen sind klein, den meisten Platz brauchen die PDFs der Skripte.

---

## Wo liegen die Daten, wie lange, und welche Sicherungen gibt es?

**Auf dem iPad** liegt alles im Speicher der Web-App (IndexedDB `lernheft-ipad` der Adresse certain05012.github.io): die
ganze Bibliothek mit Notizen, Einstellungen und den PDFs, die schon geladen sind. Die Web-App auf dem Home-Bildschirm hat
dafür einen eigenen Speicher, getrennt von Safari.

- **Wie lange:** bis du die App vom Home-Bildschirm löschst. Safari löscht den Speicher einer App auf dem
  Home-Bildschirm nicht nach einer Zeit ohne Besuch (das gilt nur für Seiten in Safari-Tabs), und die App bittet um
  dauerhaften Speicher, damit iOS ihn auch bei knappem Platz nicht leert. Weg ist er ausserdem, wenn du in den
  Einstellungen die Website-Daten von Safari löschst.
- **PDFs:** Nach dem ersten Abgleich kommen sie im Hintergrund. Öffne ein Skript, das du offline brauchst, einmal mit
  Netz, dann liegt es auf dem iPad.
- **Was offline geschrieben wird**, bleibt auf dem iPad und geht beim nächsten Abgleich nach Dropbox.

**In Dropbox** liegt eine vollständige Kopie (Bibliothek und Daten), am PC eine weitere. Fällt ein Gerät aus, ist auf den
anderen alles da.

**Sicherungen** (von selbst):

| Was | Wo | Wie lange |
|---|---|---|
| Gelöschte Dokumente und Seiten | Lernheft › Papierkorb (`Daten\Papierkorb`) | bis du sie dort endgültig löschst |
| Vorige Fassung jeder Seite (höchstens alle 10 Minuten) | `Daten\Sicherung-Seiten` am PC bzw. auf dem iPad (nur auf dem Gerät, nicht in Dropbox) | bis zur nächsten Fassung |
| Beide Fassungen, wenn iPad und PC dieselbe Seite geändert haben | zusammengeführt, die Kopie in `Daten\Konflikte` | bleibt liegen |
| Frühere Fassungen und gelöschte Dateien | Dropbox (dropbox.com › Datei › Versionsverlauf, bzw. Gelöschte Dateien) | 30 Tage (Dropbox Basic) |

**Von Hand:** alles in eine Datei, z. B. nach iCloud Drive (nächster Abschnitt). Am PC zusätzlich: Menü › Speicherort ›
Export in eine Datei.

---

## Sicherheit

Was ich geprüft habe (Stand 3.9.1):

- **Zugriff nur auf den App-Ordner:** Mit „App folder“ gibt Dropbox der App nur Zugriff auf `Apps\<Name deiner App>`.
  Das erzwingt Dropbox auf seinen Servern; selbst ein gestohlener Zugang käme nicht an den Rest deiner Dropbox.
- **Anmeldung ohne Geheimnis (OAuth mit PKCE):** Das Passwort tippst du nur bei Dropbox ein, nie im Lernheft. Dropbox
  schickt die Anmeldung nur an die eingetragene Adresse zurück, und der Code taugt nur zusammen mit einem Zufallswert, den
  allein dein iPad kennt. Der App key ist öffentlich und allein nutzlos.
- **Wo der Zugang liegt:** nur im Speicher der Web-App auf deinem iPad (IndexedDB), nicht in Cookies, nicht im
  `localStorage`, nicht in der Adresse, nicht im Repository. Abmelden (Menü › Dropbox › Abmelden …) löscht ihn; ganz
  sperren kannst du ihn unter <https://www.dropbox.com/account/connected_apps>.
- **Keine fremden Skripte:** Die Web-App lädt nur ihre eigenen Dateien (PDF-Werkzeuge liegen in der App, kein CDN), von
  Google nur die Schrift. Eine Sicherheitsregel (Content-Security-Policy) verbietet alles andere. Getestet im Browser:
  ein fremdes Skript, ein eingeschleustes Inline-Skript, ein eingeschleuster `onerror`-Handler, Code aus Text
  (`setTimeout` mit Text) sowie das Senden an einen fremden Server per `fetch` und per Bild wurden alle blockiert; der
  Abgleich mit Dropbox, PDFs und Text liefen dabei normal.
- **PDFs:** Die bekannte Lücke in pdf.js (CVE-2024-4367, Code in Schriften) ist abgeschaltet (`isEvalSupported: false`),
  und die Sicherheitsregel blockiert ohnehin `eval`.
- **Das Repository** ist öffentlich, enthält aber nur Programmcode: keine Notizen, keine PDFs, keine Schlüssel. Die alte
  Historie mit persönlichen Daten ist gelöscht (neu angelegt am 2. 11. 2026).

Was du selbst tun solltest:

- **Zwei-Faktor-Anmeldung bei GitHub** einschalten (<https://github.com/settings/security>): Wer dein GitHub-Konto
  übernimmt, könnte die Web-App verändern. Das ist der wichtigste Punkt.
- **Zwei-Faktor-Anmeldung bei Dropbox** einschalten (<https://www.dropbox.com/account/security>).
- Keine weiteren Seiten unter `certain05012.github.io` veröffentlichen, denen du nicht traust: alle GitHub-Pages-Seiten
  deines Kontos teilen sich diese Adresse und damit den Speicher im Browser.

Nicht testen konnte ich die echte Dropbox mit deinem Konto. Die Einschränkung auf den App-Ordner prüfst du so: Nach
der Anmeldung zeigt <https://www.dropbox.com/account/connected_apps> bei deiner App „Zugriff: App-Ordner“, und im Lernheft
auf dem iPad sind nur die Dokumente aus `Apps\<Name deiner App>\Lernheft` zu sehen.

---

## iCloud Drive

Eine Web-App kann iCloud Drive nicht selbst lesen oder beschreiben (Safari erlaubt das nicht), automatisch abgleichen
kann sie deshalb nur mit Dropbox oder OneDrive. Sichern in iCloud Drive geht von Hand:

1. Menü › **Dropbox** › **Sicherung (iCloud) …** › **Als Datei sichern …**
2. Im Teilen-Menü **In Dateien sichern** › **iCloud Drive** › z. B. Ordner `Lernheft-Sicherung` › Sichern.

Die Datei (`Lernheft-Sicherung <Datum>.lernheft`) enthält alle Notizen und Einstellungen, ohne PDFs.

- **Zurückholen auf dem iPad:** im selben Dialog **Sicherung importieren …** und die Datei aus iCloud Drive wählen. Sie
  wird mit dem Vorhandenen zusammengeführt, nichts wird überschrieben.
- **Am PC:** mit [iCloud für Windows](https://apps.microsoft.com/detail/9pktq5699m62) liegt die Datei im Ordner
  iCloud Drive. Im Lernheft: Menü › Speicherort › **Sicherung importieren**.
- **Ganz ohne Cloud:** beim ersten Start „Ohne Cloud nutzen“ wählen. Dann ist diese Datei der einzige Weg, Notizen
  zwischen iPad und PC zu bringen. Die automatische Sicherung in einen iCloud-Ordner hat nur die
  [iPad-App](../Programm/Quellcode/ipad/ANLEITUNG.md).

---

## OneDrive statt Dropbox (braucht ein Azure-Konto)

Für OneDrive muss das Lernheft bei Microsoft eingetragen sein. Das geht nur mit einem Verzeichnis (Tenant), das du über
ein kostenloses Azure-Konto bekommst (Microsoft verlangt dafür eine Kreditkarte oder Telefonnummer zur Bestätigung).

1. Im Lernheft am PC den Speicherort auf `C:\Users\<Name>\OneDrive\Lernheft` legen.
2. <https://entra.microsoft.com> › **Anwendungen › App-Registrierungen** › **Neue Registrierung**: Name `Lernheft`,
   Kontotypen **Nur persönliche Microsoft-Konten**, Umleitungs-URI Plattform **Single-Page-Anwendung (SPA)** mit
   `https://certain05012.github.io/Lernheft/` › **Registrieren**.
3. **API-Berechtigungen** › Microsoft Graph › Delegiert: `Files.ReadWrite` und `offline_access`.
4. Die **Anwendungs-ID (Client-ID)** auf dem iPad unter **Erweitert** eintragen und **Mit OneDrive anmelden**.

Microsoft lässt eine Anmeldung im Browser nur 24 Stunden gelten. Die Web-App erneuert sie deshalb selbst beim Start (die
Seite springt dafür einen Augenblick zu Microsoft und zurück, ohne Rückfrage). Bist du bei Microsoft abgemeldet, zeigt
das Menü „OneDrive: bitte anmelden“: dort **Neu anmelden**.

Wechseln zwischen Dropbox und OneDrive: Menü › Dropbox › Abmelden, beim nächsten Start die andere Cloud wählen.

---

## Wenn etwas nicht klappt

- **„Invalid redirect_uri“** (Dropbox) bzw. **„redirect_uri … is not valid“** (Microsoft): Die Adresse muss genau
  `https://certain05012.github.io/Lernheft/` lauten, mit `/` am Ende.
- **Ordner fehlt:** Der Ordnername in Dropbox muss zu Schritt 1 passen. Im Dialog „Ordner fehlt“ den richtigen Namen
  eintragen und „Nochmal suchen“.
- **Fehlerliste:** Menü › Dropbox › **Fehlerliste** zeigt, was die App bemerkt hat. Kopieren und weitergeben.

---

## Für Entwickler

- Gebaut wird die Web-App aus der Oberfläche (`Programm/Quellcode/webseite`), der Ablage (`app/ablage.js`) und den
  iPad-Teilen (`ipad/web`): `cd Programm/Quellcode/ipad && npm install && node baue.js web` › Ordner `web-app`.
  Dazu kommen `web/pwa.js` (meldet die Web-App an, Service Worker, dauerhafter Speicher) und `web/sw.js` (alle Dateien
  auf dem Gerät, Version = Prüfsumme über alle Dateien).
- Veröffentlicht wird bei jedem Push auf `main` über `.github/workflows/pages.yml` (Tests, bauen, GitHub Pages).
- Am PC ausprobieren mit nachgebauter Dropbox/OneDrive: `node baue.js web && node entwicklung.js web attrappe <Lernheft-Kopie>`,
  dann `http://localhost:47830/?attrappe=http://127.0.0.1:47831`.
