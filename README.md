# Lernheft

Persönliche Lern-App (Deutsch) mit Handschrift: **Skripte (PDF) beschriften, Notizbücher und Whiteboards.**
Läuft komplett lokal als Windows-App, ohne Cloud-Anbindung. Der Datenordner darf in OneDrive, Google Drive, Dropbox oder iCloud
liegen; den Abgleich zwischen Geräten macht der Cloud-Dienst, das Lernheft führt Konflikte zusammen.

[**Download (Windows)**](../../releases/latest) · [**iPad-Web-App**](https://certain05012.github.io/Lernheft/) ([Anleitung](docs/iPad-Web-App.md)) · [iPad-App](docs/iPad-Einrichtung.md) · [Dateiformat](Programm/Quellcode/FORMAT.md)

## Inhalt

- [Download und Start](#download-und-start)
- [Funktionen](#funktionen)
- [Auf dem iPad](#auf-dem-ipad)
- [Selbst bauen](#selbst-bauen)
- [Aufbau des Projekts](#aufbau-des-projekts)
- [Neues Release veröffentlichen](#neues-release-veröffentlichen)
- [Datenschutz](#datenschutz)

## Download und Start

1. Unter [**Releases**](../../releases/latest) die Datei `Lernheft-<Version>-Windows.zip` herunterladen.
2. Zip entpacken (z. B. nach `Dokumente\Lernheft`).
3. `Lernheft.exe` starten.

Beim ersten Start legt das Lernheft die Ordner `Bibliothek` und `Daten` neben dem Programm an, oder in einem frei wählbaren
Speicherort (Menü → Speicherort). Windows meldet beim ersten Start evtl. „Unbekannter Herausgeber“, weil das Programm nicht
signiert ist: *Weitere Informationen → Trotzdem ausführen*.

## Funktionen

**Schreiben**
- **Drei Stiftarten**: Füller (Druck gibt die Breite, schnelle Züge werden feiner), Kugelschreiber (gleich breit), Pinselstift (setzt fein an, läuft spitz aus); meldet der Stift seine Drehung, dreht sich die Feder des Füllers mit
- Druck wie beim Apple Pencil: fliessende Strichbreite, die Druckkurve stellt sich selbst auf den Stift ein (eigene Kurve möglich); Neigung, Glättung (aus/niedrig/mittel/hoch), Stiftbreite in Millimetern
- **Vorschau beim Schweben**: der Apple Pencil über dem Blatt zeigt, wo und wie breit der Strich ansetzt
- Werkzeuge: Stift, Marker, Radierer, Lasso, Haftnotiz, Text, Laserpointer (leuchtet nur, solange Stift oder Taste gedrückt sind)
- **Text**: tippen und schreiben, Grösse (pt) und Farbe in der Werkzeugleiste, antippen bearbeitet, ziehen verschiebt
- Satte Tinte und eine Linie, die direkt unter der Pencil-Spitze entsteht (vorhergesagte Punkte), auch in der Web-App
- **Halten**: Stift am Strichende ruhig halten → gerade Linie; bei geschlossenen Strichen Dreieck, Viereck, Rechteck, Vieleck, Kreis oder Ellipse
- **Überkritzeln** löscht Geschriebenes (ein-/ausschaltbar)
- **Einkreisen und antippen** wählt aus, ohne zum Lasso zu wechseln
- **Palette am Stift**: Werkzeuge, Farben und Grössen dort, wo man schreibt (Apple Pencil Pro zusammendrücken, Menü der Seite oder eine eigene Geste)

**Dokumente**
- **Startseite** im Regal-Stil: Seitenleiste (Dokumente, Favoriten, Skripte, Notizbücher, Whiteboards, Papierkorb), Cover mit Stern, Name und Datum, Suche, „Neu“-Menü, Sortierung
- **Bibliothek** mit Ordnern, Skripten (PDF), Notizbüchern (A4/A3) und Whiteboards
- **Seitenleiste für PDFs**: alle Seiten als Bilder, Inhalt (Kapitel aus dem PDF oder erkannte Überschriften), Lesezeichen, Suche im Text (Strg+F)
- **Zurück nach einem Sprung**: nach dem Sprung zu einem Lesezeichen führt „Zurück zu Seite X“ genau zurück und wieder hin (Aufgaben ↔ Lösungen)
- **Papierkorb** in der App: wiederherstellen oder endgültig löschen
- **Whiteboard**: unendliche Fläche, frei zoom- und verschiebbar; als Seiten-Dokument kopieren und umgekehrt
- **Neue Seite** durch Wischen über das Seitenende
- **Tabs** oben auf Startseite und in Dokumenten (rund, waagrecht scrollbar, Dropdown für Tabs ausserhalb des Bilds), zwei Dokumente nebeneinander, eigenes Fenster, Vollbild
- **Schieber** rechts zum schnellen Blättern, nur beim Scrollen sichtbar
- Ein Farbsatz für alles: Hell, Dunkelgrau oder Dunkelblau

**Daten**
- **Autosave**: ein Dokument = ein Ordner mit versioniertem Format, atomares Schreiben, Sicherungskopie der vorigen Fassung
- **Cloud-Abgleich** mit Zusammenführen von Konfliktkopien
- **Export** als PDF und PNG an einen frei gewählten Ort („Speichern unter“); PDF mit Notizen auf dem Skript oder mit allen Notizen; alles in einer Datei sichern (`*.lernheft`)

## Auf dem iPad

**iPad-App** (empfohlen): dieselbe Bibliothek wie am PC, Abgleich über Dropbox oder OneDrive, Sicherung in iCloud Drive,
auch offline. Einstellen Schritt für Schritt mit Bildern: [iPad einstellen](docs/iPad-Einrichtung.md); die App bauen
(Mac mit Xcode): [`Programm/Quellcode/ipad/ANLEITUNG.md`](Programm/Quellcode/ipad/ANLEITUNG.md).

**Web-App** (ohne Mac): <https://certain05012.github.io/Lernheft/> in Safari öffnen und „Zum Home-Bildschirm“. Dieselbe
Bibliothek wie am PC, Abgleich über Dropbox (oder OneDrive), läuft auch offline; Sicherung in iCloud Drive als Datei.
Einrichten: [iPad-Web-App](docs/iPad-Web-App.md). Sie wird bei jeder Änderung auf `main` automatisch gebaut und über
GitHub Pages veröffentlicht (`.github/workflows/pages.yml`).

## Selbst bauen

Voraussetzung: Windows, [Node.js](https://nodejs.org) 20 oder neuer.

```bash
git clone https://github.com/certain05012/lernheft.git
cd lernheft/Programm/Quellcode/app
npm install
npm run verteilen      # baut die App und erzeugt Lernheft.exe im Hauptordner
```

Die Oberfläche (`Programm/Quellcode/webseite`) ist reines HTML/CSS/JS ohne Build-Schritt. Tests und Hinweise stehen in
[CLAUDE.md](CLAUDE.md), zum Beispiel `node Programm/Quellcode/app/test/formen.js`.

## Aufbau des Projekts

```
Lernheft/
  Lernheft.exe              Starter, startet Programm\App\Lernheft.exe
  Bibliothek/               deine Dokumente (nicht im Repository)
  Daten/                    Einstellungen, Papierkorb, Konflikte (nicht im Repository)
  Programm/
    App/                    gebaute Electron-App (nicht im Repository)
    Quellcode/
      webseite/             Oberfläche (HTML/CSS/JS)
      app/                  Electron: main.js, preload.js, ablage.js, server.js, Tests
      ipad/                 iPad-App (Capacitor) und Web-App (node baue.js web): Abgleich mit OneDrive/Dropbox
      FORMAT.md             Beschreibung des Dateiformats
  docs/                     Anleitungen (iPad)
  .github/workflows/        Veröffentlichung der Web-App (GitHub Pages) und der Releases (Windows-Paket)
```

## Neues Release veröffentlichen

1. Version in `Programm/Quellcode/app/package.json` (und `ipad/package.json`) erhöhen, Notizen in `docs/Release-<Version>.md` schreiben, committen.
2. Tag setzen und pushen: `git tag v<Version>` und `git push origin v<Version>`.
3. GitHub baut daraufhin das Windows-Paket und veröffentlicht das Release mit den Notizen (`.github/workflows/release.yml`).

Von Hand (am eigenen PC, Lernheft vorher schliessen), in `Programm/Quellcode/app`:
```bash
npm run verteilen     # bauen
npm run paket         # erzeugt Veroeffentlichen\Lernheft-<Version>-Windows.zip
```
Danach das Zip an ein Release hängen (*Releases → Draft a new release* oder
`gh release create v<Version> Veroeffentlichen\Lernheft-<Version>-Windows.zip --notes-file docs/Release-<Version>.md`).

## Datenschutz

Alle Daten bleiben auf deinem Gerät bzw. in deinem eigenen Cloud-Ordner. `Bibliothek/` und `Daten/` sind per `.gitignore`
ausgeschlossen und gehören nie ins Repository.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
