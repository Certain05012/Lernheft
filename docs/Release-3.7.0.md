## Lernheft 3.7.0

Windows-App: Zip entpacken und `Lernheft.exe` starten. Die Daten liegen in `Bibliothek` und `Daten` neben dem Programm (oder im gewählten Speicherort).

### Neu: iPad-App mit Dropbox
- Die iPad-App gleicht jetzt wahlweise mit **Dropbox** oder **OneDrive** ab (Wahl beim ersten Start). Am PC liegt der Speicherort dafür in `Dropbox\Lernheft` bzw. `OneDrive\Lernheft`.
- Wie bei OneDrive: läuft auch ohne Netz, gleiche Seiten auf PC und iPad werden zusammengeführt, Umbenennen und Verschieben am PC kommen auf dem iPad an.
- Wechseln zwischen Dropbox und OneDrive: abmelden und beim nächsten Start die andere Cloud wählen, die Bibliothek bleibt.

### Neu: Sicherung in iCloud Drive (iPad)
- Ordner in iCloud Drive wählen (z. B. `Lernheft-Sicherung`), danach sichert die App von selbst: eine vollständige Kopie samt PDFs (nur Geändertes) und je Tag alle Notizen in einer `.lernheft`-Datei (die letzten 30 Tage bleiben).
- Wiederherstellen mit einem Tipp, wird mit dem Vorhandenen zusammengeführt. Das Lernheft am PC kann die Dateien ebenfalls importieren (Menü › Speicherort › Sicherung importieren).
- Schutz: ein frisch eingerichtetes, leeres iPad löscht nichts in der Sicherung.
- Geht auch ganz ohne Dropbox/OneDrive und mit der kostenlosen Apple-ID.

### Behoben
- iPad: Benennt der PC einen Ordner um, den das iPad gerade angelegt hatte, blieb auf dem iPad ein leerer Ordner unter dem alten Namen stehen.

### Anleitung
- iPad einstellen, Schritt für Schritt mit Bildern: [`docs/iPad-Einrichtung.md`](https://github.com/Certain05012/Lernheft/blob/main/docs/iPad-Einrichtung.md)
- App aufs iPad bringen (Mac, Xcode) und Kennung bei Dropbox/Microsoft holen: [`Programm/Quellcode/ipad/ANLEITUNG.md`](https://github.com/Certain05012/Lernheft/blob/main/Programm/Quellcode/ipad/ANLEITUNG.md)

Hinweis: Windows meldet evtl. "Unbekannter Herausgeber", weil das Programm nicht signiert ist. Dann: Weitere Informationen, Trotzdem ausführen.
