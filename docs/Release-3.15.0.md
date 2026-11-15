## Lernheft 3.15.0

Windows-App: Zip entpacken und `Lernheft.exe` starten. Web-App fürs iPad: <https://certain05012.github.io/Lernheft/> (aktualisiert sich beim Öffnen von selbst, sobald diese Version auf `main` liegt).

### Neue Stiftleiste
- **Ein Stift statt drei.** In der unteren Zeile steht ein einziger Stift-Knopf mit dem Symbol der Stiftart (die Symbole von früher: Feder, Mine, Pinselspitze). Antippen öffnet ein schwebendes Fenster unter dem Knopf:
  - Füllfederhalter, Kugelschreiber oder Pinselstift, darüber eine **Strichprobe**, die zeigt, wie der Stift mit den jetzigen Einstellungen schreibt,
  - beim **Füllfederhalter**: Schärfe der Spitze, Druckempfindlichkeit, Strich-Stabilisierung; beim **Kugelschreiber**: Strich-Stabilisierung; beim **Pinselstift**: Druckempfindlichkeit und Strich-Stabilisierung,
  - **Zeichnen und Halten** (am Ende eines Strichs halten macht Linie, Pfeil oder Form sauber) und **Stiftgesten**.
  - Das Fenster schliesst sich beim Tippen daneben, mit Esc und sobald man schreibt.
- **Drei Strichstärken** als kleine Linien. Die gewählte nochmal antippen: Stärke mit dem Regler einstellen und die **Strichart** wählen: durchgezogen, **gestrichelt** oder **gepunktet**. Jede der drei Stärken merkt sich ihre Strichart (zum Beispiel Mittel durchgezogen, Gross gestrichelt). Mit dem Lasso gilt die Strichart für die Auswahl. Gestrichelte und gepunktete Striche bleiben so in der Datei, beim Abgleich und im PDF.
- **Weniger Farben, höchstens fünf.** Standard sind Schwarz, Rot, Blau und Grün. Das „+“ fügt eine Farbe hinzu (Auswahl oder eigene Farbe), bis fünf da sind. Die gewählte Farbe nochmal antippen: eine andere an ihren Platz setzen oder **entfernen**. Der Textmarker hat seine eigenen Farben. Die Farbpunkte zeigen jetzt die Farbe, die der Stift auf dem Blatt wirklich schreibt (Schwarz auf weissem Papier, auch im dunklen Design).
- **Kleiner und ruhiger:** Alle Werkzeuge sind einfache Linien-Symbole; das gewählte bekommt einen Rahmen und erscheint farbig. Die Leiste ist niedriger.
- Die frühere Einstellung „Glättung“ heisst jetzt Strich-Stabilisierung (0 bis 100 %, je Stiftart). Wer sie verstellt hatte, behält seine Stufe.

### Flüssiger schreiben und scrollen
Gemessen habe ich diesmal in zwei Browsern: Chromium und **WebKit, der Engine von Safari** (siehe unten). Was sich dabei als Bremse zeigte und behoben ist:
- **Speichern störte das Schreiben.** In der Web-App fürs iPad laufen Speichern und Packen im selben Ablauf wie die Schreibfläche. Nach jedem Strich blockierte das bei einer vollen Seite 20 bis 50 ms: genau der Ruck beim Schreiben. Jetzt wird erst gespeichert, wenn der Stift 1,2 s ruht (spätestens nach 12 s, beim Verlassen sofort), und das Vorbereiten der Datei ist deutlich billiger (jeder Strich wird nur noch einmal in Text umgewandelt).
- **Beim Schreiben wird nichts anderes mehr gemalt.** Kacheln ausserhalb des Bildes warten, solange der Stift schreibt oder schwebt, und danach wird in kleinen Portionen gearbeitet (höchstens 5 ms je Bild). Das längste Bild beim Scrollen über eine volle Seite fiel im Test von 36 ms auf 9 ms Rechenzeit.
- **Die Stiftspitze** liegt auf einer kleinen Ebene, die dem Stift folgt, statt auf einer bildschirmgrossen, die in jedem Bild neu zusammengesetzt werden musste.
- Die eigene Rechenzeit je Bild liegt beim Scrollen und Schreiben jetzt im Mittel bei 0,3 ms (Chromium) und rund 1 ms (WebKit), auch auf einer vollen Seite.

### Ehrlich: was geprüft ist und was nicht
- Alle Tests laufen jetzt zusätzlich in **WebKitGTK** (dieselbe Engine wie Safari für JavaScript, Layout und Schnittstellen). Die neue Leiste, die Fenster, Stricharten, Farben, das Kachel-Bild Pixel für Pixel und die Rechenzeiten sind dort geprüft.
- **Nicht** prüfen kann ich von hier das Malen auf dem iPad selbst: Safari auf dem iPad malt mit Apples Grafik (CoreGraphics/CoreAnimation), WebKit unter Linux anders. Ein echtes iPad stand wieder nicht zur Verfügung. Ob es auf dem A15 jetzt flüssig ist, lässt sich also erst dort sehen.
- Dafür gibt es neu eine **Messung in der App**: Dokument öffnen, dann Einstellungen › Erweitert › **„Flüssigkeit messen“**, 20 Sekunden normal scrollen und schreiben. Danach steht ein kurzer Text da (Bilder je Sekunde, Ruckler, wie oft und wie lange der Ablauf blockiert war, Rechenzeit der Schreibfläche). Mit „Kopieren“ lässt er sich weitergeben. Ruckelt es noch, sagt dieser Text, ob es an eigener Arbeit liegt oder am Malen im Browser, und damit, wo als Nächstes anzusetzen ist.

### Für Entwickler
- Tests in WebKit: `apt-get install -y webkit2gtk-driver xvfb`, dann `LH_BROWSER=webkit node test/browser/<test>.js` (`kacheln.js`, `fluss.js`, `neuerungen315.js`).
- Dateiformat: Striche können das Feld `l` tragen (`g` gestrichelt, `p` gepunktet), siehe `FORMAT.md`. Ältere Versionen zeichnen solche Striche durchgezogen.

Windows meldet evtl. "Unbekannter Herausgeber", weil das Programm nicht signiert ist. Dann: Weitere Informationen, Trotzdem ausführen.
