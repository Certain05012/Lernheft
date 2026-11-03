## Lernheft 3.11.0

Windows-App: Zip entpacken und `Lernheft.exe` starten. Web-App fürs iPad: <https://certain05012.github.io/Lernheft/> (aktualisiert sich beim Öffnen von selbst).

### Schreiben: ruhig und natürlich
- **Kein Zittern mehr, ohne Nachziehen:** Jeder Punkt wird aus seinen Nachbarn davor *und danach* gemittelt, sobald ein paar weitere da sind. Das letzte Stück bis unter den Stift zeigt die Spitze genau dort, wo der Pencil ist. Gemessen an einer langsam geschriebenen Welle: Unruhe von 27° auf 5° je Punkt, Ecken bleiben spitz (Abweichung 0,07 px). Standard ist „Niedrig“ (wirkt nur auf wenige Pixel); Mittel und Hoch glätten stärker, ebenfalls ohne Nachziehen.
- **Tinte ohne Nähte:** Ein Strich ist jetzt eine einzige gefüllte Fläche. Vorher bestand er aus vielen Stücken mit eigener Breite, deren Ränder sich überlagerten: dicke Linien bekamen einen welligen, perligen Rand. Auch im PDF-Export.
- Beim Schreiben und danach bleibt der Strich pixelgenau gleich (0 Bildpunkte Unterschied bei 100 % und 200 %).

### Formen anpassen
- Eine eingerastete Form folgt weiter dem Stift: **Linie und Pfeil** drehen und strecken sich um ihren Anfangspunkt, **Kreis, Ellipse, Rechteck, Vielecke** wachsen oder schrumpfen um ihre Mitte, stufenlos, solange man den Stift auf dem Blatt lässt.

### Menü der Seite
- **Rechtsklick**, **ein Finger lange halten** oder **zwei Finger halten** öffnen dasselbe Menü: Rückgängig, Wiederholen, Bild einfügen (an der Stelle), Seite nach links/rechts drehen, Seite davor/danach einfügen, Seite löschen bzw. Lesezeichen, Seite als PNG, Gesten und Werkzeugleiste einstellen.
- Zwei Finger halten verzeiht jetzt leichtes Wandern der Finger und einen zusätzlichen Kontakt am Rand.

### Werkzeugleiste
- **Gestaltete Symbole:** Stift (die Spitze zeigt die gewählte Farbe), Textmarker, Radierer, Lasso, Haftnotiz, Text, Laser, Hand, Seite drehen (Blatt mit Pfeil, nicht mehr zu verwechseln mit Rückgängig).
- Im Dialog „Werkzeugleiste anpassen“ steht neben jedem Eintrag sein Symbol.
- **Vollbild:** Die schwebende Leiste bleibt schlank, auch mit offenen Farben und Grössen (etwa halb so hoch wie vorher), und ragt nicht mehr über den Bildschirmrand.
- Behoben: Mit dem Hand-Werkzeug erschien das Stift-Panel (Gesten) in Handschrift-Schrift.

### Grosse Bibliotheken
- **Handschrift wird erst geladen, wenn man ein Dokument öffnet**, und beim Schliessen wieder freigegeben. Gemessen mit 30 Notizbüchern zu je 3 voll beschriebenen Seiten: Start bis zur Bibliothek 0,7 s statt 17,6 s, Arbeitsspeicher der Oberfläche 13 MB statt 323 MB. Auf dem iPad bleibt das Lernheft so auch mit vielen Heften flüssig.
- Nichts kann dabei verloren gehen: eine Seite, die nicht geladen ist, wird nie geschrieben, und wird sie doch geschrieben, führt das Lernheft sie mit der Datei zusammen.
- Notizbücher im Querformat haben ein liegendes Cover (vorher war nur die obere Hälfte gefüllt).

### Sicherheit
- Alles weiter mit derselben Sicherheitsregel: nur eigene Skripte, kein eval oder Inline-Code, Verbindungen nur zu Dropbox, Microsoft und Google Fonts. Die neuen Schnittstellen zum Laden der Handschrift nehmen nur Schlüssel von Seiten an und nur aus dem Lernheft-Fenster.

Windows meldet evtl. "Unbekannter Herausgeber", weil das Programm nicht signiert ist. Dann: Weitere Informationen, Trotzdem ausführen.
