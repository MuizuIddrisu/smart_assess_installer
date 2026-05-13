/**
 * Smart Assess – Installer Wizard main process
 * This is the Electron app shown DURING installation.
 * It hosts the installer.html UI and communicates with NSIS.
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

let installerWindow = null;

function createInstallerWindow() {
  installerWindow = new BrowserWindow({
    width: 780,
    height: 580,
    resizable: false,
    center: true,
    frame: true,
    backgroundColor: '#f1f5f9',
    title: 'Smart Assess Setup',
    icon: path.join(__dirname, '..', 'assets', 'icon_256.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  installerWindow.setMenuBarVisibility(false);
  installerWindow.loadFile(path.join(__dirname, 'installer.html'));

  installerWindow.on('close', (e) => {
    // Prevent accidental close during install
    e.preventDefault();
    dialog.showMessageBox(installerWindow, {
      type: 'question',
      buttons: ['Cancel Installation', 'Continue Installing'],
      defaultId: 1,
      cancelId: 1,
      title: 'Cancel Setup',
      message: 'Are you sure you want to cancel the Smart Assess installation?',
      detail: 'Smart Assess has not been fully installed yet.',
    }).then(({ response }) => {
      if (response === 0) app.exit(0);
    });
  });
}

app.whenReady().then(createInstallerWindow);

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.on('browse-dir', (event) => {
  dialog.showOpenDialog(installerWindow, {
    title: 'Choose Installation Folder',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: 'C:\\Program Files\\Smart Assess',
  }).then(({ filePaths }) => {
    if (filePaths && filePaths.length > 0) {
      event.reply('dir-selected', filePaths[0]);
    }
  });
});

ipcMain.on('cancel-install', () => {
  dialog.showMessageBox(installerWindow, {
    type: 'question',
    buttons: ['Yes, cancel', 'No, continue'],
    defaultId: 1,
    cancelId: 1,
    title: 'Cancel Installation',
    message: 'Cancel Smart Assess installation?',
    detail: 'Installation is not complete. Are you sure you want to exit?',
  }).then(({ response }) => {
    if (response === 0) app.exit(0);
  });
});

ipcMain.on('finish-install', (_, { launch }) => {
  // Signal to NSIS that user clicked Finish
  // In production this writes to a temp file that NSIS reads
  const fs = require('fs');
  const os = require('os');
  const flagFile = path.join(os.tmpdir(), 'sa_install_launch.txt');
  try {
    fs.writeFileSync(flagFile, launch ? '1' : '0');
  } catch (_) {}
  app.exit(launch ? 2 : 0); // exit code 2 = launch app after install
});
