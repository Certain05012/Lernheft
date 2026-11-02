## Lernheft 3.9.2

Windows-App: Zip entpacken und `Lernheft.exe` starten. Web-App fürs iPad: <https://certain05012.github.io/Lernheft/> (aktualisiert sich ab 3.9.1 von selbst beim Öffnen).

### iPad
- **Kein leerer Balken mehr unten:** Die Schreibfläche reicht bis an den Bildschirmrand. Seitenanzeige und Hinweise bleiben über dem Home-Balken.
- **Vollbild:** Das Blatt beginnt unter der Statusleiste, oben links wird nichts mehr verdeckt.
- **Flüssiger scrollen:** Neue PDF-Seiten bekommen sofort ein grobes Bild, das scharfe wird erst gerendert, wenn du nicht mehr scrollst (pdf.js rechnet auf demselben Thread wie das Scrollen). Ein fertiges Seitenbild zeichnet nur noch seine eigene Seite neu, nicht die ganze Fläche.
- **Schneller öffnen und teilen:** Alle PDFs teilen sich einen pdf.js-Worker, statt dass jedes Dokument (auch das zweite beim Teilen) einen neuen startet.
- **Tab mit dem Finger andocken:** Einen Tab nach unten aus der Leiste ziehen und auf der linken oder rechten Hälfte loslassen. Waagrecht wischen scrollt die Tabs wie bisher.
- **Geteilte Ansicht:** Wird ein Dokument beim Teilen schmaler (oder beim Aufheben breiter, oder beim Drehen des iPads), passt es die Seite neu ein, statt halb abgeschnitten neben der Trennlinie zu stehen.

### Stift
- **Feinere Grössen:** Klein 0,25 mm, Mittel 0,45 mm, Gross 0,8 mm (vorher 0,4 / 0,8 / 1,6), Regler 0,1 bis 2,5 mm in Schritten von 0,05 mm. Einmal für alle Geräte umgestellt, danach bleibt, was du einstellst.

Windows meldet evtl. "Unbekannter Herausgeber", weil das Programm nicht signiert ist. Dann: Weitere Informationen, Trotzdem ausführen.
