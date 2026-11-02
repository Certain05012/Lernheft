# Lernheft auf dem iPad

> **Neu (3.8.0):** Die Web-App gleicht jetzt mit Dropbox oder OneDrive ab, ohne Mac: [iPad-Web-App](iPad-Web-App.md).
> Ausserdem gibt es eine iPad-App mit Abgleich über OneDrive oder Dropbox (gleiche Bibliothek wie am PC, auch offline).
> Einstellen mit Bildern: [iPad einstellen](iPad-Einrichtung.md), App bauen: [`Programm/Quellcode/ipad/ANLEITUNG.md`](../Programm/Quellcode/ipad/ANLEITUNG.md). Der Text unten beschreibt
> die ältere Web-App ohne Abgleich.

Das Lernheft besteht aus einer Oberfläche in HTML/CSS/JavaScript (`Programm/Quellcode/webseite`) und der Windows-App (Electron),
die nur Ordner und Fenster dazu liefert. Auf dem iPad läuft die **Oberfläche allein**. Sie speichert dann im Speicher des
Browsers (IndexedDB) statt in einem Ordner. Das ist der wichtigste Unterschied, siehe „Daten“ unten.

## Die drei Wege im Vergleich

| | A. Web-App (PWA) über Safari | B. Verpackt mit Capacitor (Xcode) | C. Nativ (Swift) oder Flutter |
|---|---|---|---|
| Aufwand | gering (ein Nachmittag) | mittel (Mac, Xcode, 1–2 Tage) | sehr hoch (alles neu schreiben) |
| Kosten | 0 € | 0 € (Apple-ID) oder 99 $/Jahr | 0 € oder 99 $/Jahr |
| Brauchst du einen Mac? | nein | **ja** | **ja** |
| Code | derselbe wie am PC | derselbe wie am PC | neu |
| Stift (Pencil) | Druck und Neigung über Pointer Events, mit Einschränkungen | wie A (läuft in WKWebView) | beste Anbindung |
| Speicher | Safari-Speicher, kann gelöscht werden | gleiche Art, aber stabiler als im Browser | Dateien der App, iCloud möglich |
| Offline | ja, nach dem ersten Laden | ja, alles liegt in der App | ja |
| Update | automatisch beim Öffnen | neu bauen und installieren | neu bauen und installieren |

**Empfehlung für dich als Einzelentwickler: Weg A.** Du brauchst keinen Mac und kein Konto, Änderungen kommen sofort aufs iPad.
Wenn dir der Safari-Speicher zu unsicher wird oder du mehr Platz brauchst, wickelst du dieselbe Oberfläche später mit Capacitor
ein (Weg B). Weg C lohnt sich nicht.

## Weg A: Web-App über Safari

1. **Veröffentlichen.** Das Repo enthält `.github/workflows/pages.yml`. In GitHub: *Settings → Pages → Source: GitHub Actions*.
   Nach dem nächsten Push auf `main` liegt die App unter `https://<dein-name>.github.io/lernheft/`.
   (Privates Repo: Pages gibt es dann nur mit bezahltem Plan. Die Seite selbst ist öffentlich erreichbar, deine Notizen
   liegen aber nie dort, nur der Programmcode.)
2. **Auf dem iPad** Safari öffnen, die Adresse laden, Teilen-Symbol → **„Zum Home-Bildschirm“**. Ab jetzt startet das Lernheft
   wie eine App, ohne Adressleiste.
3. **Einmal online alles laden:** Bibliothek öffnen und ein Skript (PDF) öffnen, damit die PDF-Werkzeuge im Speicher landen.
   Danach läuft alles ohne Netz (Service Worker `sw.js`).
4. **Sichern:** Menü → *Speicher und Sicherung* → *Alles in einer Datei sichern*. Die Datei landet in der Dateien-App
   (iCloud Drive). Das machst du regelmässig, siehe nächster Abschnitt.

### Grenzen von Safari
- **Speicher:** Safari löscht Webseiten-Daten nach etwa 7 Tagen ohne Besuch, **ausser** die App liegt auf dem Home-Bildschirm
  (dann gilt diese Frist nicht), und bei Platzmangel. Das Lernheft bittet um „dauerhaften“ Speicher, Safari entscheidet aber selbst.
  Die Obergrenze liegt grob bei einem Teil des freien Gerätespeichers, grosse PDFs belegen viel.
- **Kein Ordner, keine iCloud-Synchronisation** wie am PC: Safari lässt eine Web-App keinen Ordner wählen. PC und iPad haben
  getrennte Daten. Zum Übertragen nutzt du die Sicherungsdatei (Web-Sicherung ↔ Web-Sicherung). Die Datei der Windows-App
  (`.lernheft`) hat ein anderes Format.
- **Apple Pencil:** Druck und Neigung kommen als Pointer Events an. Ob Safari bei deinem iPad Neigung meldet, siehst du im
  Stift-Panel („Stift prüfen“). Ein Doppeltipp auf den Pencil und der Radiergummi-Wechsel sind für Web-Apps nicht erreichbar.
- Hover und „Scribble“ (Handschrift zu Text) betreffen nur Textfelder, nicht die Schreibfläche.

## Weg B: Capacitor (verpackte App)

Voraussetzung: Mac mit Xcode, Node.js.

```bash
cd Programm/Quellcode/webseite          # oder in einen eigenen Ordner "ios-app" kopieren
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init Lernheft ch.lernheft.app --web-dir=.
npx cap add ios
npx cap sync ios
npx cap open ios                        # öffnet Xcode
```

In Xcode: Projekt wählen → *Signing & Capabilities* → *Team* = deine Apple-ID → iPad per Kabel anschliessen und oben als Ziel
wählen → ▶ (Run). Beim ersten Mal auf dem iPad *Einstellungen → Allgemein → VPN & Geräteverwaltung* dem Entwickler vertrauen.

- Vorteil: Die Daten liegen im App-Container (WKWebView), nicht im Safari-Verlauf: weniger Löschrisiko, kein 7-Tage-Problem.
- Nachteil: Du brauchst einen Mac und musst bei Codeänderungen neu bauen (`npx cap sync`).
- Das Lernheft greift nicht auf Capacitor-Funktionen zu, es läuft unverändert. Dateien exportierst du über das Teilen-Menü.

## Auf dem eigenen iPad ohne App Store

| | Xcode mit kostenloser Apple-ID | TestFlight / App Store |
|---|---|---|
| Kosten | 0 € | Apple Developer Program, **99 $/Jahr** |
| Gültigkeit | die App läuft **7 Tage**, dann neu installieren (Kabel, Xcode) | TestFlight-Builds 90 Tage, App Store unbegrenzt |
| Geräte | nur deine, wenige | bis zu 10 000 Tester, öffentlich |
| Prüfung | keine | TestFlight: kurze Prüfung, App Store: Review |

Für ein privates Lernwerkzeug lohnt sich das Entwicklerprogramm kaum. Mit Weg A brauchst du es nicht.

## Was im Code für das iPad angepasst ist
- Pointer Events mit `touch-action: none` auf der Schreibfläche, `getCoalescedEvents`, Druck und Neigung (`pointerType: pen`).
- Handballenschutz: Finger werden während und 0,5 s nach dem Stift ignoriert.
- Safari-Seitenzoom (`gesturestart`), Gummiband (`overscroll-behavior`), Doppeltipp-Zoom, Textmarkierung und Lupe sind abgeschaltet.
- Grosse Ziele (42–46 px) bei Touch-Bedienung, Sicherheitsabstände für Kamera-Aussparung und Home-Balken, Hoch- und Querformat.
- Installierbar (`manifest.webmanifest`, Symbol, `apple-mobile-web-app-*`), offlinefähig (`sw.js`).
- Sicherung in einer Datei (Menü → Speicher und Sicherung).

## Was du auf dem iPad testen solltest
1. Mit dem Pencil schreiben: Druck, Neigung, Glättung (Einstellungen), Halten für Linien und Formen.
2. Mit der Handfläche aufstützen: nichts darf scrollen oder zoomen.
3. Mit zwei Fingern zoomen und verschieben, Seite wischen bis ans Ende (neue Seite).
4. Hoch- und Querformat drehen, Werkzeugleiste ein- und ausklappen.
5. Flugmodus: App vom Home-Bildschirm starten.
6. Sichern, App löschen, neu installieren, Sicherung importieren.
