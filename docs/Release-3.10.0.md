## Lernheft 3.10.0

Windows-App: Zip entpacken und `Lernheft.exe` starten. Web-App fürs iPad: <https://certain05012.github.io/Lernheft/> (aktualisiert sich beim Öffnen von selbst).

### Schreiben wie auf Papier
- **Keine andere Linie mehr nach dem Absetzen:** Ein Strich sieht beim Schreiben und danach pixelgenau gleich aus (gemessen bei 100 %, 125 %, 150 % und 200 % Skalierung: 0 Bildpunkte Unterschied). Vorher wurde er nach dem Absetzen auf weniger Punkte reduziert und als Kurve zwischen den Punkten gemalt: Ecken und Spitzen wurden abgerundet, und die Linie veränderte sich sichtbar.
- **Linie durch die Punkte:** Striche laufen jetzt durch jeden Punkt des Stifts, an scharfen Knicken bleiben Spitzen spitz.
- **Glättung standardmässig aus:** Die Linie liegt genau unter der Pencil-Spitze (gemessen 0,07 px). „Niedrig“ verschob Ecken um bis zu 7 px und ist jetzt sanfter (etwa 3,5 px).
- Die Ebenen liegen genau auf dem Pixelraster des Bildschirms (vorher bei 150 % um einen halben Pixel versetzt).

### Gesten
- **Zwei Finger tippen:** Rückgängig. **Drei Finger tippen:** Wiederholen. **Zwei Finger halten:** Seiten-Menü (drehen, Gesten, Leiste).
- **Apple Pencil doppelt tippen** (Radierer an/aus) und **zusammendrücken** (Farben und Grössen): nur in der iPad-App. Safari gibt diese Gesten an Webseiten nicht weiter.
- Alles frei einstellbar: Stift-Panel › Gesten (oder ⋯ › Gesten einstellen …). Möglich sind Rückgängig, Wiederholen, Radierer an/aus, letztes Werkzeug, Stift, Marker, Lasso, Text, Hand, Laser, Seiten-Menü, Farben und Grössen, Werkzeugleiste ein/aus, Vollbild oder nichts.

### Seiten
- **Seite drehen** um 90° nach links oder rechts: Knöpfe ↺ ↻ in der Werkzeugleiste, im Menü ⋯ und im Seiten-Menü. Alles darauf dreht mit (Haftnotizen, Bilder und Text bleiben lesbar aufrecht). Gilt für Notizbücher und PDF-Seiten, auch im Export.
- **Querformat:** Neue Notizbücher wahlweise im Hochformat oder im Querformat.
- **PDFs im Querformat** und Seiten mit eigener Drehung in der Datei werden richtig herum angezeigt.

### Werkzeugleiste
- **Anpassen:** ⋯ › Werkzeugleiste anpassen … Jedes Symbol lässt sich aus- und einblenden, die Reihenfolge änderst du wie bisher durch Ziehen.
- **Farbige Symbole** (abschaltbar im selben Dialog).
- **Feinere Stiftgrössen** aus 3.9.2 bleiben.

### Bibliothek
- **Rechtsklick** (oder lange drücken mit dem Finger) auf ein Dokument oder einen Ordner öffnet dasselbe Menü wie der Pfeil am Namen.

### Haftnotiz
- Beim Anlegen geht keine Tastatur mehr auf: Das Werkzeug springt zurück zum Stift, und du schreibst direkt auf die Notiz. Text tippen: die Notiz mit dem Finger antippen.

### Flüssiger
- **Scrollen:** Das fertige Bild wird verschoben, gemalt wird nur der neu sichtbare Streifen. Bei 4-fach gebremster CPU auf einer übervollen Seite: längstes Bild 50 ms statt 250 ms, kein volles Neumalen mehr beim Scrollen.
- **Neumalen:** Jeder Strich merkt sich seine fertige Kurve, in Ruhe werden die Nachbarseiten vorbereitet (volles Neumalen 19 statt 178 ms im selben Test).
- **Schreiben:** kein Bild über 18 ms während eines langen Strichs (gleicher Test). Gespeichert wird erst, wenn der Stift kurz ruht.
- **Trennlinie (zwei Dokumente):** Das Bild wird beim Ziehen nicht mehr gestreckt, es wandert nur mit.
- Tipp für 120 Hz auf dem iPad: Einstellungen › Apps › Safari › Erweitert › Feature Flags › „Prefer Page Rendering Updates near 60fps“ ausschalten. Safari zeichnet Webseiten sonst nur mit 60 Bildern pro Sekunde.

### Sicherheit
- Die Windows-App liefert ihre Oberfläche jetzt mit derselben Sicherheitsregel aus wie die Web-App: nur eigene Skripte, kein eval oder Inline-Code, nicht in fremde Seiten einbettbar. Der lokale Server bleibt nur auf diesem PC erreichbar (127.0.0.1, Prüfung des Host-Namens).
- Behoben: „Bild kopieren“ in der Web-App (seit 3.9.1 durch die Sicherheitsregel blockiert).

Hinweis: Striche behalten jetzt alle Punkte, Seiten-Dateien werden dadurch etwas grösser.

Windows meldet evtl. "Unbekannter Herausgeber", weil das Programm nicht signiert ist. Dann: Weitere Informationen, Trotzdem ausführen.
