## Lernheft 3.8.0

Windows-App: Zip entpacken und `Lernheft.exe` starten. Die Daten liegen in `Bibliothek` und `Daten` neben dem Programm (oder im gewählten Speicherort).

### Neu: Web-App fürs iPad mit Dropbox oder OneDrive, auch offline
- Das Lernheft läuft jetzt ohne Mac auf dem iPad: **<https://certain05012.github.io/Lernheft/>** in Safari öffnen, Teilen › „Zum Home-Bildschirm“.
- Gleiche Oberfläche und gleiche Bibliothek wie am PC. Abgleich mit dem Lernheft-Ordner in **Dropbox** oder **OneDrive**, wie bei der iPad-App: gleiche Seiten auf PC und iPad werden zusammengeführt, Umbenennen und Verschieben kommen an.
- **Offline:** Die ganze App liegt auf dem iPad und startet auch im Flugmodus. Was du ohne Netz schreibst, wird abgeglichen, sobald wieder Internet da ist. Updates kommen von selbst, sie gelten ab dem nächsten Start.
- Dropbox braucht nur einen kostenlosen App-Schlüssel (ohne Kreditkarte), die Anmeldung bleibt dauerhaft gültig. OneDrive braucht dafür ein Azure-Konto; Microsoft lässt die Anmeldung im Browser nur 24 Stunden gelten, die Web-App erneuert sie selbst beim Start.
- **iCloud Drive:** Sicherung als Datei über das Teilen-Menü („In Dateien sichern“ › iCloud Drive), zurückholen auf dem iPad oder am PC (Menü › Speicherort › Sicherung importieren). Automatisch in iCloud Drive sichern kann eine Web-App nicht, das erlaubt Safari nicht; dafür gibt es die iPad-App.
- Einrichten Schritt für Schritt: [`docs/iPad-Web-App.md`](https://github.com/Certain05012/Lernheft/blob/main/docs/iPad-Web-App.md)

### Aus 3.7.0 (war noch nicht als Release erschienen)
- iPad-App gleicht wahlweise mit **Dropbox** oder **OneDrive** ab
- iPad-App: automatische **Sicherung in iCloud Drive** (vollständige Kopie samt PDFs und je Tag eine `.lernheft`-Datei, 30 Tage)
- Sicherheit: Lücke in pdf.js (CVE-2024-4367) abgeschwächt
- Alte Daten werden nur auf dem Gerät übernommen, von dem sie stammen

Hinweis: Windows meldet evtl. "Unbekannter Herausgeber", weil das Programm nicht signiert ist. Dann: Weitere Informationen, Trotzdem ausführen.
