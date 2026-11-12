import Foundation
import UIKit
import UniformTypeIdentifiers
import Capacitor

// Sicherung in einen Ordner der Dateien-App (gedacht für iCloud Drive, geht mit jedem Ordner dort).
// Die Logik (was wann gesichert wird) steht in web/sicherung.js; hier nur der Zugang zum Ordner:
//   info, waehle, vergiss, liste, teil + uebernimm (Datei in Teilen schreiben), lies (in Stücken), loesche.
// Pfade sind relativ zum gewählten Ordner, mit "/". Den Ordner merkt sich die App als Lesezeichen (bookmark), damit
// sie ihn auch nach einem Neustart wieder öffnen darf. Dafür braucht es keine iCloud-Berechtigung im Apple-Konto
// (geht auch mit der kostenlosen Apple-ID).
@objc(LHOrdnerPlugin)
public class LHOrdnerPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "LHOrdnerPlugin"
    public let jsName = "LHOrdner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "waehle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "vergiss", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liste", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "teil", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "uebernimm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "lies", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loesche", returnType: CAPPluginReturnPromise)
    ]

    private let schluessel = "lernheft.sicherung.ordner"
    // Eine Warteschlange: Aufrufe laufen nacheinander, nie zwei Schreibvorgänge gleichzeitig
    private let schlange = DispatchQueue(label: "ch.lernheft.sicherung")
    private var wartend: CAPPluginCall?
    private lazy var teileOrdner: URL = {
        let d = FileManager.default.temporaryDirectory.appendingPathComponent("lernheft-sicherung", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()

    struct Fehler: LocalizedError {
        let text: String
        var errorDescription: String? { text }
    }

    // MARK: Ordner

    private func gemerkterOrdner() throws -> URL {
        guard let daten = UserDefaults.standard.data(forKey: schluessel) else { throw Fehler(text: "Kein Ordner für die Sicherung gewählt.") }
        var veraltet = false
        let url: URL
        do { url = try URL(resolvingBookmarkData: daten, options: [], relativeTo: nil, bookmarkDataIsStale: &veraltet) }
        catch { throw Fehler(text: "Der Ordner für die Sicherung ist nicht mehr erreichbar. Bitte neu wählen.") }
        if veraltet {
            let ok = url.startAccessingSecurityScopedResource()
            if let neu = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
                UserDefaults.standard.set(neu, forKey: schluessel)
            }
            if ok { url.stopAccessingSecurityScopedResource() }
        }
        return url
    }

    // Im gewählten Ordner arbeiten (mit Zugriffsrecht, das danach wieder abgegeben wird)
    private func imOrdner<T>(_ arbeit: (URL) throws -> T) throws -> T {
        let basis = try gemerkterOrdner()
        let ok = basis.startAccessingSecurityScopedResource()
        defer { if ok { basis.stopAccessingSecurityScopedResource() } }
        return try arbeit(basis)
    }

    // Relativer Pfad -> URL im Ordner (ohne "..")
    private func ziel(_ basis: URL, _ pfad: String) throws -> URL {
        var u = basis
        for teil in pfad.split(separator: "/") {
            if teil == ".." || teil == "." { throw Fehler(text: "Ungültiger Pfad: \(pfad)") }
            u = u.appendingPathComponent(String(teil))
        }
        return u
    }
    // iCloud Drive zeigt noch nicht geladene Dateien (je nach iOS) als ".Name.icloud"
    private func platzhalter(_ url: URL) -> URL {
        url.deletingLastPathComponent().appendingPathComponent("." + url.lastPathComponent + ".icloud")
    }

    private func koordiniert(schreiben url: URL, _ optionen: NSFileCoordinator.WritingOptions, _ arbeit: (URL) throws -> Void) throws {
        var fehler: NSError?
        var innen: Error?
        NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: url, options: optionen, error: &fehler) { u in
            do { try arbeit(u) } catch { innen = error }
        }
        if let e = fehler { throw e }
        if let e = innen { throw e }
    }
    private func koordiniert(lesen url: URL, _ arbeit: (URL) throws -> Void) throws {
        var fehler: NSError?
        var innen: Error?
        NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: url, options: [], error: &fehler) { u in
            do { try arbeit(u) } catch { innen = error }
        }
        if let e = fehler { throw e }
        if let e = innen { throw e }
    }

    // Im Hintergrund ausführen, Fehler als Ablehnung melden
    private func ausfuehren(_ call: CAPPluginCall, _ arbeit: @escaping () throws -> [String: Any]) {
        schlange.async {
            do { call.resolve(try arbeit()) }
            catch { call.reject(error.localizedDescription) }
        }
    }

    // MARK: Aufrufe

    @objc func info(_ call: CAPPluginCall) {
        ausfuehren(call) {
            guard UserDefaults.standard.data(forKey: self.schluessel) != nil, let url = try? self.gemerkterOrdner() else { return ["gewaehlt": false] }
            return ["gewaehlt": true, "name": url.lastPathComponent, "icloud": url.path.contains("/Mobile Documents/")]
        }
    }

    @objc func waehle(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let auswahl = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder], asCopy: false)
            auswahl.delegate = self
            auswahl.allowsMultipleSelection = false
            self.wartend?.reject("Abgebrochen", "ABGEBROCHEN")
            self.wartend = call
            self.bridge?.viewController?.present(auswahl, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = wartend else { return }
        wartend = nil
        guard let url = urls.first else { call.reject("Abgebrochen", "ABGEBROCHEN"); return }
        let ok = url.startAccessingSecurityScopedResource()
        defer { if ok { url.stopAccessingSecurityScopedResource() } }
        do {
            let daten = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
            UserDefaults.standard.set(daten, forKey: schluessel)
            call.resolve(["gewaehlt": true, "name": url.lastPathComponent, "icloud": url.path.contains("/Mobile Documents/")])
        } catch {
            call.reject("Der Ordner lässt sich nicht merken: \(error.localizedDescription)")
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        wartend?.reject("Abgebrochen", "ABGEBROCHEN")
        wartend = nil
    }

    @objc func vergiss(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: schluessel)
        call.resolve()
    }

    // { pfad, tief } -> { eintraege: [{ pfad, ordner, groesse }] } (Pfade relativ zum gewählten Ordner)
    @objc func liste(_ call: CAPPluginCall) {
        let pfad = call.getString("pfad") ?? ""
        let tief = call.getBool("tief") ?? false
        ausfuehren(call) {
            try self.imOrdner { basis in
                let start = try self.ziel(basis, pfad)
                let basisPfad = basis.standardizedFileURL.resolvingSymlinksInPath().path
                var eintraege: [[String: Any]] = []
                var istOrdner: ObjCBool = false
                guard FileManager.default.fileExists(atPath: start.path, isDirectory: &istOrdner), istOrdner.boolValue else { return ["eintraege": eintraege] }
                let felder: [URLResourceKey] = [.isDirectoryKey, .fileSizeKey]
                let optionen: FileManager.DirectoryEnumerationOptions = tief ? [] : [.skipsSubdirectoryDescendants]
                guard let liste = FileManager.default.enumerator(at: start, includingPropertiesForKeys: felder, options: optionen) else { return ["eintraege": eintraege] }
                for case let url as URL in liste {
                    let p = url.standardizedFileURL.resolvingSymlinksInPath().path
                    guard p.hasPrefix(basisPfad + "/") else { continue }
                    let rel = String(p.dropFirst(basisPfad.count + 1))
                    let werte = try? url.resourceValues(forKeys: Set(felder))
                    let ordner = werte?.isDirectory ?? false
                    var e: [String: Any] = ["pfad": rel, "ordner": ordner]
                    if !ordner { e["groesse"] = werte?.fileSize ?? 0 }
                    eintraege.append(e)
                }
                return ["eintraege": eintraege]
            }
        }
    }

    // Ein Stück einer Datei (base64) an eine Teil-Datei anhängen; neu = von vorne beginnen
    @objc func teil(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), id.range(of: "^[A-Za-z0-9]+$", options: .regularExpression) != nil else { call.reject("Ungültige Kennung"); return }
        let text = call.getString("daten") ?? ""
        let neu = call.getBool("neu") ?? false
        ausfuehren(call) {
            guard let daten = Data(base64Encoded: text) else { throw Fehler(text: "Ungültige Daten") }
            let datei = self.teileOrdner.appendingPathComponent(id)
            if neu || !FileManager.default.fileExists(atPath: datei.path) {
                FileManager.default.createFile(atPath: datei.path, contents: nil)
            }
            let h = try FileHandle(forWritingTo: datei)
            defer { try? h.close() }
            try h.seekToEnd()
            h.write(daten)
            return [:]
        }
    }

    // Die fertige Teil-Datei an ihren Platz im Ordner (ersetzt, was dort liegt)
    @objc func uebernimm(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), id.range(of: "^[A-Za-z0-9]+$", options: .regularExpression) != nil else { call.reject("Ungültige Kennung"); return }
        let pfad = call.getString("pfad") ?? ""
        ausfuehren(call) {
            let quelle = self.teileOrdner.appendingPathComponent(id)
            guard FileManager.default.fileExists(atPath: quelle.path) else { throw Fehler(text: "Teile fehlen für \(pfad)") }
            defer { try? FileManager.default.removeItem(at: quelle) }
            try self.imOrdner { basis in
                let z = try self.ziel(basis, pfad)
                try FileManager.default.createDirectory(at: z.deletingLastPathComponent(), withIntermediateDirectories: true)
                try self.koordiniert(schreiben: z, .forReplacing) { u in
                    if FileManager.default.fileExists(atPath: u.path) { try FileManager.default.removeItem(at: u) }
                    try FileManager.default.copyItem(at: quelle, to: u)
                }
                // Alter Platzhalter derselben Datei (nicht geladen) ist damit überholt
                let platz = self.platzhalter(z)
                if FileManager.default.fileExists(atPath: platz.path) { try? FileManager.default.removeItem(at: platz) }
            }
            return [:]
        }
    }

    // { pfad, von, laenge } -> { daten (base64), groesse }. Lädt die Datei aus iCloud, wenn sie noch nicht da ist.
    @objc func lies(_ call: CAPPluginCall) {
        let pfad = call.getString("pfad") ?? ""
        let von = max(0, call.getInt("von") ?? 0)
        let laenge = max(1, min(call.getInt("laenge") ?? 1_572_864, 8_388_608))
        ausfuehren(call) {
            try self.imOrdner { basis in
                let z = try self.ziel(basis, pfad)
                if !FileManager.default.fileExists(atPath: z.path) {
                    try? FileManager.default.startDownloadingUbiquitousItem(at: z)
                }
                var ergebnis: [String: Any] = [:]
                try self.koordiniert(lesen: z) { u in
                    let groesse = (try FileManager.default.attributesOfItem(atPath: u.path)[.size] as? NSNumber)?.intValue ?? 0
                    let h = try FileHandle(forReadingFrom: u)
                    defer { try? h.close() }
                    try h.seek(toOffset: UInt64(min(von, groesse)))
                    let daten = h.readData(ofLength: laenge)
                    ergebnis = ["daten": daten.base64EncodedString(), "groesse": groesse]
                }
                return ergebnis
            }
        }
    }

    // Datei oder Ordner im gewählten Ordner löschen (fehlt sie, ist das kein Fehler)
    @objc func loesche(_ call: CAPPluginCall) {
        let pfad = call.getString("pfad") ?? ""
        ausfuehren(call) {
            if pfad.split(separator: "/").isEmpty { throw Fehler(text: "Den gewählten Ordner selbst löscht die App nicht.") }
            try self.imOrdner { basis in
                let z = try self.ziel(basis, pfad)
                for u in [z, self.platzhalter(z)] where FileManager.default.fileExists(atPath: u.path) {
                    try self.koordiniert(schreiben: u, .forDeleting) { x in try FileManager.default.removeItem(at: x) }
                }
            }
            return [:]
        }
    }
}

// Der Bridge-ViewController der App: wie der von Capacitor, meldet zusätzlich das Modul für die Sicherung an und gibt die
// Gesten des Apple Pencil an die Oberfläche weiter (Doppeltippen: Pencil 2 und Pro; Zusammendrücken: Pencil Pro).
// Die Oberfläche (leinwand.js, Ereignis "lh-pencil") entscheidet, was sie tun (Einstellungen, Bereich "Gesten").
// Safari gibt diese Gesten an Webseiten nicht weiter, in der Web-App gibt es sie deshalb nicht.
class LernheftViewController: CAPBridgeViewController, UIPencilInteractionDelegate {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LHOrdnerPlugin())
        let stift = UIPencilInteraction()
        stift.delegate = self
        view.addInteraction(stift)
    }

    private func meldeStift(_ art: String) {
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('lh-pencil', { detail: '\(art)' }))", completionHandler: nil)
    }

    // iPadOS bis 17.4
    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) { meldeStift("doppeltipp") }

    // ab iPadOS 17.5 (dann ruft das System nur noch diese auf)
    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) { meldeStift("doppeltipp") }

    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
        if squeeze.phase == .ended { meldeStift("druecken") }
    }
}
