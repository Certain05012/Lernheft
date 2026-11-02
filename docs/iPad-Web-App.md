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

## Einmalig am PC (etwa 10 Minuten)

### 1. Dropbox am PC und Speicherort des Lernhefts

1. Kostenloses Konto auf <https://www.dropbox.com> anlegen (falls noch keins) und
   [Dropbox für Windows](https://www.dropbox.com/install) installieren. Danach gibt es den Ordner `C:\Users\<Name>\Dropbox`.
2. Im Lernheft am PC: **Menü › Speicherort** › den Ordner `C:\Users\<Name>\Dropbox\Lernheft` wählen (neu anlegen).
   Das Lernheft kopiert alles dorthin und startet neu. Ab jetzt gleicht Dropbox diesen Ordner ab.

### 2. Lernheft bei Dropbox eintragen

Damit sich die Web-App mit deinem Dropbox-Konto anmelden darf, braucht sie einen App-Schlüssel von Dropbox. Kostenlos,
ohne Kreditkarte.

1. <https://www.dropbox.com/developers/apps> öffnen, mit **deinem Dropbox-Konto** anmelden.
2. **Create app**:
   - *Choose an API*: **Scoped access**
   - *Choose the type of access*: **Full Dropbox** (damit die App den Ordner `Lernheft` sieht, den auch der PC benutzt)
   - *Name your app*: z. B. `Lernheft-deinname` (der Name muss bei Dropbox einmalig sein)
   - **Create app**
3. Reiter **Permissions**: `files.metadata.read`, `files.content.read` und `files.content.write` anhaken › unten
   **Submit**.
4. Reiter **Settings**:
   - Bei **OAuth 2 › Redirect URIs** genau diese Adresse eintragen (mit `/` am Ende) und **Add**:
     ```
     https://certain05012.github.io/Lernheft/
     ```
   - **Allow public clients (Implicit Grant & PKCE)**: muss auf **Allow** stehen (Standard).
   - Den **App key** kopieren (z. B. `a1b2c3d4e5f6g7h`). Er ist kein Geheimnis. Das **App secret** brauchst du nicht,
     gib es nicht weiter.
5. Fertig. Die App bleibt im Status *Development*, das reicht für dich; eine Freigabe durch Dropbox ist nicht nötig.

Der App key kann auch fest in `Programm/Quellcode/ipad/web/konfig.js` bei `dropboxAppKey` stehen, dann musst du ihn
auf dem iPad nicht eintippen.

---

## Auf dem iPad

1. **Safari** öffnen, <https://certain05012.github.io/Lernheft/> laden.
2. **Zuerst auf den Home-Bildschirm:** Teilen-Knopf (Quadrat mit Pfeil) › **Zum Home-Bildschirm** › Hinzufügen.
   Wichtig: Safari hält die Daten der App auf dem Home-Bildschirm getrennt von den Safari-Tabs. Richte das Lernheft
   deshalb erst in der App auf dem Home-Bildschirm ein, nicht im Safari-Tab.
3. Das Lernheft vom Home-Bildschirm starten.
4. **Erweitert** aufklappen, bei „Dropbox: App-Schlüssel“ den App key aus Schritt 2.4 eintragen (entfällt, wenn er in
   `konfig.js` steht). „Ordner in der Cloud“: `Lernheft` (so heisst der Ordner in Dropbox aus Schritt 1).
5. **Mit Dropbox anmelden** › Zugriff erlauben.
6. Der erste Abgleich lädt die Bibliothek. Die PDFs kommen danach im Hintergrund; lass die App dafür eine Weile offen
   (oder öffne die Skripte, die du offline brauchst, einmal).

Danach startet das Lernheft sofort, auch im Flugmodus. Die Anmeldung bei Dropbox bleibt dauerhaft gültig.

### Gut zu wissen

- **Abgleich:** solange die App offen ist alle 30 Sekunden und nach jeder Änderung, ausserdem beim Zurückkehren in die App.
  Stand und „Jetzt abgleichen“: Menü › **Dropbox**.
- **Updates** lädt die App im Hintergrund, sie gelten ab dem nächsten Start.
- **Speicher:** Safari löscht die Daten einer App auf dem Home-Bildschirm nicht von selbst. Wird die App vom
  Home-Bildschirm gelöscht, sind auch ihre Daten auf dem iPad weg (in Dropbox bleibt alles).
- **Platz:** Dropbox Basic hat 2 GB. Notizen sind klein, den meisten Platz brauchen die PDFs der Skripte.

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
