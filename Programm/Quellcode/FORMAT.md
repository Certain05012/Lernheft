# Dateiformat des Lernhefts (Version 2)

Offen und ohne Besonderheiten: JSON, die Handschrift zusätzlich mit gzip komprimiert. Ein Browser oder ein iPad kann die Dateien
mit `JSON.parse` und `DecompressionStream('gzip')` lesen. Eine fertige Umsetzung (Lesen, Schreiben, Zusammenführen) ist
`webseite/format.js`, reines JavaScript ohne Abhängigkeiten.

## Ordner (der Speicherort, frei wählbar, auch in einer Cloud)

```
<Speicherort>\
  Bibliothek\<Ordner>\<Dokument>\
      Handschrift.lernheft.json      Beschreibung (JSON, lesbar)
      Handschrift\<Seite>.lhz        je Seite eine Datei (gzip-JSON)
      <Name>.pdf                     nur bei Skripten
  Daten\
      app-daten.json                 Fortschritt, Lernzeit, alte Daten mathe-des-tages:* mit Marke alt-uebernommen (JSON)
      Einstellungen.json             gemeinsame Einstellungen, z. B. die drei Stiftgrössen (JSON)
      Whiteboard\<JJJJ-MM-TT>.lhz    Whiteboard pro Tag
      Konflikte\, Papierkorb\, Sicherung-Format1\   aufgehobene Kopien, nie gelöscht
```

Der Pfad des Speicherorts steht nicht hier, sondern nur im Profil des Geräts (`speicherort.json`). Geräte-Einstellungen
(Druckkurve, Fensteraufteilung, Design) stehen in `geraet-einstellungen.json` im Profil und kommen nie in den Speicherort.
Es gibt keine Sperrdateien und keine Datenbank. Geschrieben wird atomar (Nebendatei `.tmp`, dann umbenennen).

## Beschreibung `Handschrift.lernheft.json`

```json
{ "lernheft": 2, "id": "…", "art": "notizbuch" | "skript", "eigenschaften": { "papier": "karo", "seite": 1, … },
  "statistik": { "sekunden": 0, "tage": { "2026-09-30": 30 } },
  "seiten": ["s1", "s2"],            // nur Notizbuch: Reihenfolge der Seiten
  "seitenWeg": { "s3": 1790000000000 },   // entfernte Seiten (Grabstein)
  "pdf": "Name.pdf",                 // nur Skript
  "geaendert": 1790000000000 }
```

Skripte können in `eigenschaften.lesezeichen` die Seiten mit Lesezeichen tragen (`[3, 11]`, Seitennummern ab 1, sortiert;
fehlt das Feld, gibt es keine). Beim Zusammenführen gilt wie bei allen Eigenschaften die jüngere Fassung.

## Seite `*.lhz` (gzip von UTF-8-JSON)

```json
{ "lh": 2, "art": "seite", "id": "s1", "t": 1790000000000,
  "e": [ Element, … ],
  "x": { "<Element-Id>": 1790000000000 } }
```

`lh` ist die Versionsnummer. Eine Datei mit grösserem `lh` als bekannt wird nicht geöffnet und nicht überschrieben.
`x` sind Grabsteine: wann ein Element gelöscht wurde (Einträge älter als 180 Tage werden entfernt).

**Strich** `{ "i": Id, "w": 0 Stift | 1 Marker, "f": Farbe, "d": Dicke, "m": geändert am (ms), "q": […], "c" | "r": … }`

* `q`: Koordinaten in Zehntel-Pixeln (1 Einheit = 1/10 px bei 100 % Zoom, A4 = 794 × 1123 px), `[x0, y0, dx1, dy1, …]`,
  ab dem zweiten Punkt als Differenz zum vorigen Punkt.
* Code pro Punkt = `Druck (0…32) * 8 + Neigung (0…7)`. Sind alle Codes gleich, steht nur `c` (der Code),
  sonst `r` = `[c0, dc1, dc2, …]` (Differenzen).
* Druck = Code >> 3 geteilt durch 32, Neigung = (Code & 7) geteilt durch 7 (0 = aufrecht, 1 = flach).

**Haftnotiz** `{ "k": "n", "i": Id, "x", "y", "b", "h", "f", "t": Text, "gr", "erstellt", "zu", "m", "e": [Striche auf der Notiz] }`

**Bild** `{ "k": "b", "i": Id, "x", "y", "b", "h", "src": "data:image/jpeg;base64,…" | "data:image/png;base64,…", "erstellt", "m" }`

* Das Bild steht als data-URL in der Seite selbst (gleicht sich mit ihr ab, keine eigene Datei). Beim Einfügen wird es auf höchstens
  2000 Pixel an der längsten Seite verkleinert und als JPEG (Fotos) oder PNG (Bildschirmfotos, Durchsichtiges) gespeichert,
  meist unter 3,5 MB.
* `x`, `y`, `b`, `h` in Einheiten wie die Striche; das Seitenverhältnis bleibt beim Skalieren. Bilder liegen unter Schrift und Haftnotizen.
* Ältere Versionen (vor den Bildern) lesen `k: "b"` als leeren Strich: wer dort die Seite ändert, verliert das Bild. Alle Geräte
  (auch das iPad) sollten daher dieselbe Version haben.

**Text** (ab 3.9.0) `{ "k": "t", "i": Id, "x", "y", "b", "t": Text, "gr", "f", "erstellt", "m" }`

* `x`, `y` = linke obere Ecke der ersten Zeile, `gr` = Schriftgrösse in Einheiten (18 pt = 24), `f` = Farbe wie bei Strichen
  (Name wie `tinte`, `rot` oder `#rrggbb`; Namen passen sich hellem und dunklem Papier an), `t` = Text mit `\n` für neue Zeilen.
* `b` = so breit darf eine Zeile höchstens werden, danach wird an Leerzeichen umgebrochen (ein zu langes Wort Zeichen für
  Zeichen). Schrift Atkinson Hyperlegible, Zeilenhöhe 1,3 × `gr`. Die Höhe steht nicht in der Datei, sie folgt aus dem Umbruch.
* Wie bei Bildern: Versionen vor 3.9.0 kennen `k: "t"` nicht und lesen es als leeren Strich.

## Punkte vereinfachen

Die Schreibfläche lässt beim Abschliessen eines Strichs Punkte weg, die auf der Verbindung ihrer Nachbarn liegen (Douglas-Peucker,
`LHFormat.vereinfache` in `format.js`). Erlaubt ist eine Abweichung von 8 % der Strichdicke (mindestens 0,15 Einheiten), zusätzlich
darf sich weder der Druck noch die Neigung gegenüber dem Verlauf zwischen den Nachbarn merklich ändern, damit auch die Breite der Linie
gleich bleibt. Anfang und Ende bleiben. Das Dateiformat ändert sich dadurch nicht: ältere Dateien mit mehr Punkten lesen sich wie bisher,
ältere Programme lesen auch die neuen. Formen (Linie, Pfeil, Vieleck, Kreis, …) werden nicht vereinfacht.

## Abgleich zwischen Geräten

* Jedes Element hat eine Kennung `i` und den Zeitpunkt der letzten Änderung `m`. Beim Zusammenführen gilt je Kennung die
  Fassung mit dem höheren `m`; ein Grabstein gilt, wenn er nicht älter als `m` ist.
* Legt die Cloud bei einem Konflikt eine Kopie an (`s1-PC.lhz`, `s1 (1).lhz`, `s1 (Konflikt von …).lhz`), liest die App
  sie mit, führt sie in `s1.lhz` zusammen und legt die Kopie unter `Daten\Konflikte` ab.
* Ändert die Cloud eine Datei, während im Programm noch ungespeicherte Arbeit wartet, wird beim Speichern zusammengeführt
  statt überschrieben.
* Beschreibung: die jüngere Fassung gilt, Seiten und Lernzeiten werden vereint. Einstellungen: je Schlüssel die jüngere.

## Sicherung in einer Datei `*.lernheft`

gzip-JSON `{ "lh": 2, "art": "sicherung", "ordner": […], "dokumente": [{ "id", "pfad", "meta", "seiten": { "<Seite>": <Seite wie oben> } }], "whiteboard": {…}, "einstellungen": {…}, "app": {…} }`,
ohne PDFs. Importieren führt zusammen und überschreibt nichts.

## Ältere Dateien (Version 1)

`Handschrift.lernheft.json` mit `"lernheft": 1` und allen Seiten samt Elementen als Text wird beim ersten Start übertragen.
Die alte Datei wird vorher nach `Daten\Sicherung-Format1` kopiert.

## Whiteboard (unendliche Fläche)

Ein Whiteboard ist ein Notizbuch mit `"papier": "whiteboard"` und genau einer Seite in `seiten`. Zusätzlich: `"raster": "punkte" | "karo" | "linien" | "blanko"`.
Die Seite ist eine unendliche Fläche: Koordinaten der Striche und Haftnotizen dürfen negativ sein, einen Seitenrand gibt es nicht.
Ältere Versionen zeigen es als normale Seite ohne Raster (die Daten bleiben unverändert). Umwandeln in Seiten und zurück erzeugt jeweils ein neues Dokument.

## Stiftgrössen

`Einstellungen.json` (`einst:stift`) speichert die drei Grössen je Werkzeug in Millimetern (`presets`, `einheit: "mm"`; Radierer = Durchmesser).
Die Strichdicke `d` in der Seitendatei bleibt in Einheiten (1 mm = 96 / 25,4 Einheiten, A4 = 794 × 1123 = 210 × 297 mm).

## Sicherungskopie einer Seite

Vor dem Überschreiben kopiert das Lernheft die lesbare vorige Fassung einer Seite nach `Daten\Sicherung-Seiten\<Pfad mit " - ">.lhz` (höchstens alle 10 Minuten je Seite).
