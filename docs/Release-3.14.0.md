## Lernheft 3.14.0

Windows-App: Zip entpacken und `Lernheft.exe` starten. Web-App fürs iPad: <https://certain05012.github.io/Lernheft/> (aktualisiert sich beim Öffnen von selbst, sobald diese Version auf `main` liegt).

### Flüssiger scrollen, vor allem in Safari auf dem iPad
- **Das Blatt liegt jetzt auf Kacheln.** Bisher war die Schreibfläche eine einzige grosse Zeichenfläche (bis 16 Millionen Pixel). Beim Scrollen wurde sie alle paar hundert Pixel komplett auf sich selbst kopiert und der frei gewordene Streifen im selben Bild neu gemalt. Genau das war der Ruck beim Wischen und beim Wechsel von einer Seite zur nächsten. Jetzt besteht sie aus vielen kleinen Flächen:
  - Scrollen verschiebt sie nur noch (das macht die Grafikkarte), kopiert wird nichts mehr.
  - Was als Nächstes ins Bild kommt, wird **im Voraus** gemalt, eine Kachel nach der anderen, mit mehr Vorrat in der Richtung, in die man scrollt. Die Arbeit verteilt sich so auf viele Bilder statt auf eines.
  - Nach dem Zoomen und nach jeder Änderung wird zuerst nur gemalt, was zu sehen ist, der Rest danach.
- **PDF-Seiten bremsen das Scrollen nicht mehr:** Ein Seitenbild, das gerade scharf gerendert wird, hält an, sobald man scrollt oder zoomt, und macht weiter, wenn die Fläche ruht. Gemalt wird nur der Teil der PDF-Seite, den eine Kachel braucht, und mit einem Verfahren, das in Safari deutlich schneller ist.
- **Weniger Speicher mit mehreren Tabs:** Ein Dokument im Hintergrund hält kein Bild seiner Seiten mehr.
- Ehrlich dazu: Geprüft ist in Chromium, dass das Bild nach Scrollen, Springen, Zoomen, Schreiben und Radieren Pixel für Pixel dasselbe ist wie vorher, dass beim Scrollen nie etwas Leeres zu sehen ist und nie mehr die ganze Fläche neu gemalt wird. Ein iPad mit Safari stand wieder nicht zum Testen zur Verfügung. Wenn es dort noch ruckelt, bitte melden (iPad-Modell, Skript oder Notizbuch, wie voll die Seite ist).

### Braucht es dafür Rust?
Kurz: für dieses Problem nicht. Das Ruckeln kam nicht von langsamem JavaScript, sondern davon, wie viel der Browser in einem Bild malen und kopieren musste; das macht Safari selbst, egal in welcher Sprache der Aufruf geschrieben ist. Rust (als WebAssembly) würde sich erst lohnen, wenn das Lernheft das Malen ganz selbst übernimmt, zum Beispiel mit einem eigenen Renderer auf der Grafikkarte (wgpu/WebGPU). Das wäre ein grösserer Umbau und der nächste Schritt, falls die Kacheln auf dem iPad nicht reichen.

### Formen
- **Die Erkennung ist nachsichtiger:** Eine Form darf ein gutes Viertel offen bleiben, wackliger und schiefer gezeichnet sein und wird trotzdem erkannt (schiefe Rechtecke werden Rechtecke, eirige Kreise Kreise). Beim Halten darf die Hand etwas mehr zittern.
- **Beim Drehen steht keine Gradzahl mehr** daneben. Das Einrasten bei 0°, 45°, 90° bleibt.

Windows meldet evtl. "Unbekannter Herausgeber", weil das Programm nicht signiert ist. Dann: Weitere Informationen, Trotzdem ausführen.
