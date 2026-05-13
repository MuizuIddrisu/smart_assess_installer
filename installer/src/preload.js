'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion:    () => ipcRenderer.invoke('get-app-version'),
  // Opens the in-page preview modal (same as Ctrl+P).
  // The modal's Print button calls printWithSettings() below.
  print:            () => ipcRenderer.invoke('trigger-print'),
  // Called by print_preview.js when the user clicks Print in the modal.
  // opts: { pageSize: 'A4'|'A5'|'Letter', landscape: true|false }
  printWithSettings: (opts) => ipcRenderer.invoke('print-with-settings', opts),
  showAbout:        () => ipcRenderer.invoke('show-about'),
  platform:         process.platform,
});
