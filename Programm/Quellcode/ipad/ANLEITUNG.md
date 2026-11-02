# Lernheft auf dem iPad: Anleitung

Die iPad-App ist dieselbe Oberfläche wie am PC, eingepackt als echte App (Capacitor). Sie arbeitet mit einer eigenen Kopie
der Bibliothek auf dem iPad, auch ohne Netz, und gleicht sie mit dem Lernheft-Ordner in deinem **OneDrive** oder deiner
**Dropbox** ab (`OneDrive\Lernheft` bzw. `Dropbox\Lernheft`, derselbe Ordner wie der Speicherort am PC). Haben iPad und PC
dieselbe Seite geändert, werden beide Fassungen zusammengeführt. Welche Cloud, wählst du beim ersten Start.

Du brauchst: dein iPad mit Kabel, einen Mac mit Xcode, eine Apple-ID und dein Microsoft-Konto (für OneDrive) **oder**
dein Dropbox-Konto. Du machst nur den Schritt für die Cloud, die du nutzt: **1a** (OneDrive) oder **1b** (Dropbox).

Am PC muss der Speicherort des Lernhefts im selben Cloud-Ordner liegen: im Lernheft unter Menü › Speicherort z. B.
`C:\Users\<Name>\Dropbox\Lernheft` wählen (der Dropbox-Client für Windows gleicht ihn dann ab).

---

## Schritt 1a: App bei Microsoft eintragen (nur für OneDrive; einmalig, etwa 5 Minuten, am PC)

Damit sich die App mit deinem Microsoft-Konto anmelden darf, braucht sie eine Kennung von Microsoft. Kostenlos.

1. Öffne <https://entra.microsoft.com> und melde dich mit **deinem Microsoft-Konto** an (dasselbe wie für OneDrive).
   Falls Microsoft fragt, ob ein Verzeichnis angelegt werden soll: ja (kostenlos).
2. Links: **Anwendungen › App-Registrierungen** (englisch: *Applications › App registrations*) › **Neue Registrierung**.
3. Ausfüllen:
   - Name: `Lernheft`
   - Unterstützte Kontotypen: **Nur persönliche Microsoft-Konten** (*Personal Microsoft accounts only*)
   - Umleitungs-URI: leer lassen
   - **Registrieren**
4. Auf der Übersichtsseite steht die **Anwendungs-ID (Client-ID)**, z. B. `1a2b3c4d-…`. Kopieren und mir schicken
   (oder selbst in `web/konfig.js` bei `clientId` eintragen). Sie ist kein Geheimnis.
5. Links **Authentifizierung** › **Plattform hinzufügen** › **Mobilgerät- und Desktopanwendungen**
   (*Mobile and desktop applications*) › bei „Benutzerdefinierte Umleitungs-URIs“ eintragen:
   ```
   ch.lernheft.app://auth
   ```
   › **Konfigurieren**.
6. Nur wenn du die App auch am PC im Browser ausprobieren willst: nochmal **Plattform hinzufügen** › **Single-Page-Anwendung** ›
   `http://localhost:47830/` › **Konfigurieren**.
7. Links **API-Berechtigungen** › **Berechtigung hinzufügen** › **Microsoft Graph** › **Delegierte Berechtigungen** ›
   `Files.ReadWrite` und `offline_access` anhaken › **Berechtigungen hinzufügen**. (Eine Zustimmung durch einen
   Administrator ist bei persönlichen Konten nicht nötig; du bestätigst beim ersten Anmelden selbst.)

Die App darf damit nur auf deine Dateien in OneDrive zugreifen, und nur, nachdem du dich auf dem iPad angemeldet hast.

---

## Schritt 1b: App bei Dropbox eintragen (nur für Dropbox; einmalig, etwa 5 Minuten, am PC)

Damit sich die App mit deinem Dropbox-Konto anmelden darf, braucht sie einen App-Schlüssel von Dropbox. Kostenlos.

1. Öffne <https://www.dropbox.com/developers/apps> und melde dich mit **deinem Dropbox-Konto** an.
2. **Create app**:
   - *Choose an API*: **Scoped access**
   - *Choose the type of access*: **Full Dropbox** (damit die App den Ordner `Lernheft` sieht, den auch der PC benutzt)
   - *Name your app*: z. B. `Lernheft-deinname` (der Name muss bei Dropbox einmalig sein)
   - **Create app**
3. Reiter **Permissions**: `files.metadata.read`, `files.content.read` und `files.content.write` anhaken › unten
   **Submit**. (Mehr braucht die App nicht. `account_info.read` ist schon an, damit zeigt sie deinen Namen.)
4. Reiter **Settings**:
   - **App key** kopieren und mir schicken (oder selbst in `web/konfig.js` bei `dropboxAppKey` eintragen). Er ist kein
     Geheimnis. Das **App secret** brauchst du nicht, gib es nicht weiter.
   - Bei **OAuth 2 › Redirect URIs** eintragen und **Add**:
     ```
     ch.lernheft.app://auth
     ```
     Nur wenn du die App auch am PC im Browser ausprobieren willst, zusätzlich `http://localhost:47830/`.
   - **Allow public clients (Implicit Grant & PKCE)**: muss auf **Allow** stehen (Standard).
5. Fertig. Die App bleibt im Status *Development*. Das reicht für dich (bis 50 Konten), eine Freigabe durch Dropbox ist
   nicht nötig.

Die App darf damit nur auf deine Dateien in Dropbox zugreifen, und nur, nachdem du dich auf dem iPad angemeldet hast.
Die Anmeldung läuft ohne Geheimnis (PKCE). Dropbox lässt eine Adresse wie `ch.lernheft.app://auth` nur mit diesem
Verfahren zu. Meldet Dropbox trotzdem „Invalid redirect_uri“, prüfe, ob sie unter Redirect URIs genau so eingetragen ist.

---

## Schritt 2: Mac vorbereiten (einmalig)

1. **Xcode** aus dem App Store installieren, einmal öffnen und die zusätzlichen Komponenten installieren lassen
   (bei der Frage nach Plattformen: **iOS** auswählen).
2. In Xcode: **Xcode › Settings › Accounts › +** › Apple-ID hinzufügen (deine normale Apple-ID reicht).
3. **Node.js** (LTS) von <https://nodejs.org> installieren.
4. Den Code auf den Mac holen. Im Terminal:
   ```bash
   git clone https://github.com/certain05012/lernheft.git
   ```
   (GitHub fragt nach Name und Token, weil das Repository privat ist. Alternativ den Ordner `Programm/Quellcode`
   per USB-Stick kopieren.)

---

## Schritt 3: App bauen und aufs iPad bringen

Im Terminal auf dem Mac:

```bash
cd lernheft/Programm/Quellcode/ipad
npm install
npm run xcode
```

`npm run xcode` baut die App-Dateien und öffnet das Projekt in Xcode. Dort:

1. Links ganz oben **App** (blaues Symbol) anklicken › in der Mitte das Ziel **App** › Reiter **Signing & Capabilities**.
2. **Team**: deine Apple-ID (*Personal Team*) wählen.
   Meldet Xcode, dass `ch.lernheft.app` nicht verfügbar ist: bei **Bundle Identifier** z. B. `ch.lernheft.deinname`
   eintragen. Die Anmeldung bei Microsoft funktioniert trotzdem weiter.
3. **iPad** per Kabel anschliessen, auf dem iPad „Diesem Computer vertrauen“ bestätigen.
4. Auf dem iPad: **Einstellungen › Datenschutz & Sicherheit › Entwicklermodus** einschalten (das iPad startet neu).
   Der Schalter erscheint erst, nachdem das iPad einmal mit Xcode verbunden war.
5. In Xcode oben in der Mitte dein **iPad als Ziel** wählen und **▶** (Run) drücken. Das erste Bauen dauert ein paar Minuten.
6. Beim ersten Mal: auf dem iPad **Einstellungen › Allgemein › VPN und Geräteverwaltung** › deine Apple-ID › **Vertrauen**.
   Dann in Xcode nochmal **▶**.

### Beim ersten Start auf dem iPad

1. **Mit OneDrive anmelden** oder **Mit Dropbox anmelden** › Seite von Microsoft bzw. Dropbox: mit deinem Konto anmelden
   und den Zugriff erlauben. (Steht dort, die Kennung fehle: unter **Erweitert** die Anwendungs-ID aus Schritt 1a bzw.
   den App-Schlüssel aus Schritt 1b eintragen.)
2. Die App sucht den Ordner **Lernheft** in deiner Cloud und lädt die Bibliothek (Beschreibungen und Handschrift,
   das geht schnell). Die PDFs der Skripte kommen danach im Hintergrund: die App dafür eine Weile offen lassen, am
   besten im WLAN.
3. Fertig. Ab jetzt startet die App sofort, auch ohne Netz.

### Gut zu wissen

- **Abgleich**: automatisch, solange die App offen ist (alle 30 s und kurz nach jeder Änderung), ausserdem beim Öffnen
  und wenn das iPad wieder online ist. Stand im Menü (⋯) unter **OneDrive** bzw. **Dropbox**; dort auch „Jetzt abgleichen“.
- **Ohne Netz** schreibst du ganz normal weiter. Alles bleibt auf dem iPad und geht hoch, sobald wieder Netz da ist.
- **Gleiche Seite auf PC und iPad geändert**: beide Fassungen werden zusammengeführt, die Kopie aus der Cloud liegt danach
  unter `Daten/Konflikte` (`… (OneDrive).lhz` bzw. `… (Dropbox).lhz`).
- **Löschen** auf dem iPad legt das Dokument in den Papierkorb des Lernhefts (wie am PC). Endgültig gelöschte Dateien
  landen zusätzlich im Papierkorb von OneDrive bzw. unter „Gelöschte Dateien“ in Dropbox (dort 30 Tage wiederherstellbar).
- **Andere Cloud**: Menü › OneDrive/Dropbox › **Abmelden …**, beim nächsten Start die andere wählen. Die Bibliothek auf dem
  iPad bleibt und wird mit dem Ordner in der neuen Cloud zusammengeführt.
- **Export** (PDF, PNG): öffnet das Teilen-Menü: „In Dateien sichern“, AirDrop, Mail …
- **Fehlerliste**: Menü › OneDrive bzw. Dropbox › Fehlerliste. Wenn etwas nicht klappt: dort „Kopieren“ und mir schicken.

---

## Alle 7 Tage (kostenlose Apple-ID)

Mit einer kostenlosen Apple-ID läuft eine selbst gebaute App 7 Tage. Danach startet sie nicht mehr:
iPad an den Mac anschliessen, Xcode öffnen, **▶**. Deine Daten bleiben dabei erhalten (auf dem iPad und in OneDrive).
Mit dem Apple Developer Program (99 $/Jahr) fällt das weg.

## Sicherung in iCloud

Zusätzlich zum Abgleich (oder ganz ohne Cloud) sichert die App in einen Ordner in **iCloud Drive**:

1. Menü (⋯) › **OneDrive**/**Dropbox** bzw. **Speicher** › **Sicherung (iCloud) …** › **Ordner in iCloud Drive wählen …**
2. In der Dateien-App zu *iCloud Drive* gehen, einen Ordner anlegen oder wählen (z. B. `Lernheft-Sicherung`) ›
   **Öffnen**. Die erste Sicherung startet sofort.

Danach sichert die App von selbst: eine Minute nach dem Start, alle 30 Minuten und wenn du sie verlässt (höchstens alle
10 Minuten). Im Ordner liegt dann:

- `Lernheft/`: eine vollständige Kopie des Lernhefts mit allen PDFs, im selben Aufbau wie am PC. Geschrieben wird nur,
  was sich geändert hat. Was du löschst, verschwindet auch aus der Kopie, liegt dort aber im Papierkorb des Lernhefts
  (`Daten/Papierkorb`), so lange er nicht geleert wird.
- `Lernheft-Sicherung <Datum>.lernheft`: alle Notizen und Einstellungen in einer Datei (ohne PDFs). Die von heute ist
  immer der neueste Stand, die der letzten 30 Tage bleiben liegen.

**Wiederherstellen** (z. B. auf einem neuen iPad): App einrichten, im Dialog **Sicherung** denselben Ordner wählen ›
**Wiederherstellen …**. Die neueste Datei wird mit dem Stand auf dem iPad zusammengeführt (nichts wird überschrieben),
fehlende PDFs kommen aus der Kopie. Am PC: Lernheft › Menü › Speicherort › **Sicherung importieren …** und die
`.lernheft`-Datei aus iCloud Drive wählen.

**Schutz**: Sieht das Lernheft auf dem iPad viel leerer aus als die Kopie (z. B. frisch installiert), löscht die App in
der Kopie nichts und ersetzt keine Tagesdatei. Das steht dann in der Fehlerliste.

Ohne gewählten Ordner geht es auch von Hand: **Als Datei sichern …** öffnet das Teilen-Menü › *In Dateien sichern* ›
iCloud Drive.

Gut zu wissen: Für die Sicherung braucht es keine iCloud-Berechtigung im Apple-Konto, sie geht auch mit der kostenlosen
Apple-ID. Am PC kannst du iCloud ausserdem als Speicherort nehmen (**iCloud für Windows** aus dem Microsoft Store,
Ordner `C:\Users\<Name>\iCloudDrive\Lernheft`). Für den Abgleich mit dem iPad nimm aber OneDrive oder Dropbox:
iCloud Drive hat keine Schnittstelle, über die die App Änderungen vom PC sicher erkennen könnte.

## Neue Version installieren

```bash
cd lernheft
git pull
cd Programm/Quellcode/ipad
npm install
npm run ios
```

Dann in Xcode **▶**.

---

## Für Entwickler

- Aufbau: `web/knoten.js` (Dateisystem im Speicher, damit `app/ablage.js` unverändert läuft), `web/speicher.js`
  (IndexedDB), `web/onedrive.js` (Microsoft Graph), `web/dropbox.js` (Dropbox API v2, dieselben Aufrufe wie
  `onedrive.js`), `web/abgleich.js` (Abgleich, für beide), `web/anmeldung.js` (OAuth mit PKCE, Microsoft oder Dropbox),
  `web/bruecke.js` (`window.lernheftDesktop` wie in der Windows-App, Einrichtung mit Wahl der Cloud, Dialog, Teilen).
  `baue.js` setzt daraus und aus `../webseite` den Ordner `www` zusammen.
- Tests ohne Mac und ohne Microsoft-Konto:
  ```bash
  npm test
  ```
  (`test/ablage-speicher.js`: Ablage auf dem Speicher-Dateisystem gegen die echte auf der Festplatte;
  `test/abgleich.js`: iPad gegen eine nachgebaute OneDrive mit gleichzeitigen Änderungen, Umbenennen, Löschen, offline,
  Neustart, grossen PDFs, abgelaufener Anmeldung, Umlauten; `test/abgleich.js --dropbox`: derselbe Ablauf gegen eine
  nachgebaute Dropbox, dazu Sonderfälle von `dropbox.js`; `test/anmeldung.js`: OAuth mit PKCE für beide Clouds.
  `test/sicherung.js`: Sicherung in einen Ordner gegen einen Nachbau des Swift-Moduls (nur Geändertes, Löschen,
  30 Tage, Schutz vor leerem iPad, Wiederherstellen samt PDFs, PC kann die Datei importieren). Ohne Vorlage legen die
  Tests ein kleines Beispiel an; mit `node test/<test>.js <Lernheft-Kopie>` laufen sie auf echten Daten.)
- Sicherung: Logik in `web/sicherung.js`, Zugang zum Ordner im Swift-Modul `ios/App/App/Sicherung.swift` (`LHOrdner`:
  Ordner wählen und als Lesezeichen merken, Teile schreiben, lesen, auflisten, löschen, mit `NSFileCoordinator`),
  angemeldet in `LernheftViewController` (`SceneDelegate.swift`).
- Im Browser am PC: `npm run entwicklung` › <http://localhost:47830/> (echte Anmeldung, braucht Schritt 1a.6 bzw. die Adresse aus 1b.4) oder
  `node baue.js && node entwicklung.js attrappe <Kopie eines Lernheft-Ordners>` › die angezeigte Adresse mit
  `?attrappe=…` (nachgebaute OneDrive und Dropbox mit denselben Dateien, ohne Anmeldung; in der Einrichtung wählen).
- App-Symbol neu: `..\app\node_modules\electron\dist\electron.exe erzeuge-icon.js` (aus `app/build/icon.svg`).
