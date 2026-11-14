## Lernheft 3.13.0

Windows-App: Zip entpacken und `Lernheft.exe` starten. Web-App fürs iPad: <https://certain05012.github.io/Lernheft/> (aktualisiert sich beim Öffnen von selbst, sobald diese Version auf `main` liegt).

### Neu: Drehen
- **Auswahl drehen:** Was mit dem Lasso ausgewählt ist (Schrift, Formen, Text, Bilder), hat unter dem Rahmen einen **runden Griff**. Mit Finger, Stift oder Maus daran ziehen dreht die Auswahl stufenlos um ihre Mitte; der Winkel steht daneben, bei 0°, 45°, 90° … rastet er ein.
- **Mit zwei Fingern drehen:** Einen Finger auf die Auswahl legen und einen zweiten dazu, dann drehen wie ein Blatt Papier auf dem Tisch. Verschieben geht dabei gleichzeitig.
- **Um 90° nach links oder rechts:** zwei neue Knöpfe im Menü über der Auswahl.
- **Text und Bilder** lassen sich jetzt ebenfalls drehen. Gedrehter Text bleibt Text: antippen und weiterschreiben geht wie gewohnt, auch im PDF-Export steht er gedreht.
- **Formen gleich beim Zeichnen drehen:** Rastet eine Form ein (Stift am Ende ruhig halten) und man zieht weiter, wird sie nicht nur grösser oder kleiner, sondern dreht sich auch mit dem Stift nach links oder rechts. Die ersten paar Grad zählen nicht, damit ein Rechteck gerade bleibt, wenn man es nur grösser zieht.

### Pfeil oder Linie
- **Pfeile werden zuverlässig erkannt**, egal wie man die Spitze zeichnet: von der Spitze zurück und wieder hin (">"), als kleines Dreieck, quer hinüber, mit runder Umkehr oder die Spitze zuerst. Vorher musste die Spitze sehr genau in einer bestimmten Art gezeichnet sein, sonst wurde aus dem Pfeil eine Linie.
- **Pfeil in zwei Zügen:** erst die Linie (halten), dann die Spitze an ihr Ende zeichnen (halten). Die Spitze setzt sich sauber an die Linie.
- Ein Strich ohne Spitze bleibt eine **gerade Linie**. Neu: ein **Winkel** (Häkchen, L, Dach) wird zu zwei geraden Schenkeln statt zu einer Linie vom Anfang zum Ende.

### Laserpointer flüssig, auch in Safari auf dem iPad
- Der Laserpointer war so gebaut, dass er in jedem Bild die ganze Ebene löschte und die Spur aus bis zu 800 einzelnen Linien neu malte. In Safari reichte die Zeit dafür nicht, vor allem mit 120 Bildern pro Sekunde.
- Jetzt ist der **Punkt ein eigenes Element**, das nur verschoben wird (das erledigt die Grafikkarte), die **Spur liegt auf einer eigenen kleinen Ebene** mit einem Viertel der Pixel und wird in höchstens 24 Zügen gemalt; gelöscht wird nur, wo die Spur lag. Die grosse Schreibebene wird dabei gar nicht mehr angefasst.
- **Auswahl verschieben, drehen, grösser ziehen:** Bisher wurde bei jeder Bewegung die ganze Seite neu gemalt, auf vollen Seiten ruckelte das. Jetzt schwebt die Auswahl über dem Blatt, und nur sie wird neu gemalt (im Test auf einer vollen Seite: 1 statt 60 Neuzeichnungen, rund 4-mal so viele Bilder pro Sekunde).
- Ehrlich dazu: Gemessen ist das in Chromium (Zahl der Zeichenbefehle, gelöschte Fläche, Bildrate bei gebremster CPU). Ein iPad mit Safari stand für diese Version nicht zum Testen zur Verfügung. Wenn der Laser dort noch hakt, bitte melden, am besten mit iPad-Modell und ob 120 Hz eingeschaltet ist.

### Aufgeräumt
- **Menü ⋯ im Dokument:** statt einer Liste, die länger war als der Bildschirm, ein Feld mit Gruppen nebeneinander (Seiten, Papier, Seitenfarbe, Einfügen, Exportieren, Einstellen, Fenster). Aktionen haben Symbole; Papier, Seitenfarbe, Darstellung und Raster sind Plättchen, das Gewählte ist hervorgehoben. Das Menü passt ohne Scrollen auf den Bildschirm.
- **Werkzeugleiste im Vollbild:** Mit Stift, Marker, Radierer, Text, Laser oder Haftnotiz wurde die schwebende Leiste so breit wie der Bildschirm. Jetzt bleibt sie so breit wie mit der Hand, die untere Zeile (Farben, Grössen) richtet sich darin ein.
- **Stiftarten verständlich:** Statt drei Stift-Symbolen zeigt jede Art eine **Strichprobe** mit Namen (Füller, Kuli, Pinsel), und beim Wechseln steht kurz da, was sie ausmacht:
  - **Füller:** leicht aufgesetzt schreibt er fein, fester gedrückt breiter (wie Tinte).
  - **Kugelschreiber:** immer gleich breit, egal wie fest man drückt.
  - **Pinselstift:** doppelt so breit, setzt fein an und läuft spitz aus (für Überschriften und Hervorhebungen).

### Safari
- Menüs und Dialoge richten sich nach der wirklich sichtbaren Höhe (in Safari wurden sie unten von der Leiste des Browsers abgeschnitten).

### Dateiformat
- Text und Bilder können das Feld `dr` (Drehung in Grad) tragen, siehe `FORMAT.md`. Ältere Versionen zeigen solche Elemente ungedreht und lassen das Feld stehen. Gedrehte Striche und Formen sind ganz normale Striche, die überall gleich aussehen.

Windows meldet evtl. "Unbekannter Herausgeber", weil das Programm nicht signiert ist. Dann: Weitere Informationen, Trotzdem ausführen.
