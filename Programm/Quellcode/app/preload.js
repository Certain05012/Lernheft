'use strict';
// Brücke zwischen der Oberfläche und dem Lernheft-Ordner auf der Festplatte
const { contextBridge, ipcRenderer } = require('electron');

if (location.hostname === '127.0.0.1' && location.port === '47823') {
  let freigegeben = false;
  try { freigegeben = ipcRenderer.sendSync('lh:hallo') === true; } catch (e) { freigegeben = false; }
  if (freigegeben) {
    const aenderungsHoerer = new Set();
    ipcRenderer.on('lh:kv-geaendert', (_, aenderungen) => aenderungsHoerer.forEach(fn => fn(aenderungen)));
    // Das Fenster soll geschlossen werden: die Oberfläche sichert alles Wartende, danach wird geantwortet
    const schliessHoerer = new Set();
    ipcRenderer.on('lh:vor-schliessen', () => {
      schliessHoerer.forEach(fn => { try { fn(); } catch (e) { /* weiter, das Fenster soll zugehen */ } });
      ipcRenderer.send('lh:vor-schliessen-fertig');
    });

    contextBridge.exposeInMainWorld('lernheftDesktop', {
      version: 3,
      lokal: true,
      // Speicherort (frei wählbarer Ordner, z. B. in einer Cloud) und alles in einer einzigen Datei
      ort: {
        info: () => ipcRenderer.sendSync('lh:ort'),
        waehlen: () => ipcRenderer.invoke('lh:ort-waehlen'),
        standard: () => ipcRenderer.invoke('lh:ort-standard')
      },
      sicherung: {
        exportieren: () => ipcRenderer.invoke('lh:export-alles'),
        importieren: () => ipcRenderer.invoke('lh:import-datei'),
        info: () => ipcRenderer.invoke('lh:speicher-info')
      },
      geraet: ipcRenderer.sendSync('lh:geraet'),
      wurzel: ipcRenderer.sendSync('lh:wurzel'),
      kv: {
        alle: () => ipcRenderer.sendSync('lh:kv-alle'),
        setze: aenderungen => ipcRenderer.send('lh:kv-setze', aenderungen),
        aufAenderung: fn => { aenderungsHoerer.add(fn); }
      },
      vorSchliessen: fn => { schliessHoerer.add(fn); },
      datei: {
        get: k => ipcRenderer.invoke('lh:datei-get', k),
        put: (k, daten) => ipcRenderer.invoke('lh:datei-put', k, daten),
        del: k => ipcRenderer.invoke('lh:datei-del', k),
        liste: () => ipcRenderer.invoke('lh:datei-liste')
      },
      exportiereDok: (id, name, daten) => ipcRenderer.invoke('lh:export-dok', id, name, daten),
      exportiereDatei: (id, name, daten, endung) => ipcRenderer.invoke('lh:export-datei', id, name, daten, endung),
      papierkorb: {
        liste: () => ipcRenderer.invoke('lh:papierkorb', 'liste'),
        zurueck: name => ipcRenderer.invoke('lh:papierkorb', 'zurueck', name),
        loeschen: name => ipcRenderer.invoke('lh:papierkorb', 'loeschen', name),
        leeren: () => ipcRenderer.invoke('lh:papierkorb', 'leeren')
      },
      speichereUnter: (dateien, vorschlag) => ipcRenderer.invoke('lh:speichern-unter', dateien, vorschlag),
      zeigeDatei: pfad => ipcRenderer.invoke('lh:zeige', pfad),
      oeffneOrdner: was => ipcRenderer.invoke('lh:ordner', was)
    });
  }
}
