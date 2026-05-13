const { app, BrowserWindow, shell, dialog, Tray, Menu, nativeImage, ipcMain, globalShortcut } = require('electron');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const { spawn, execSync } = require('child_process');

// ── Globals ───────────────────────────────────────────────────────────────────
let mainWindow    = null;
let splashWindow  = null;
let tray          = null;
let serverProcess = null;
let serverPort    = null;
let serverReady   = false;
let isQuitting    = false;

const APP_NAME      = 'Smart Assess';
const APP_VERSION   = '1.0.0';
const SERVER_NAME   = 'sba_server';
// Support both old (GhanaSBA) and new (SmartAssess) appdata paths
const PORT_FILE_NEW = path.join(os.homedir(), 'AppData', 'Roaming', 'SmartAssess', 'server.port');
const PORT_FILE_OLD = path.join(os.homedir(), 'AppData', 'Roaming', 'GhanaSBA', 'server.port');
const STATE_FILE    = path.join(app.getPath('userData'), 'window-state.json');
const POLL_INTERVAL = 500;
const START_TIMEOUT = 60000;

// ── Window state persistence ──────────────────────────────────────────────────
function loadWindowState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (_) {}
  return { width: 1280, height: 820, maximized: false };
}

function saveWindowState(win) {
  try {
    const b = win.getBounds();
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      x: b.x, y: b.y,
      width: b.width, height: b.height,
      maximized: win.isMaximized()
    }));
  } catch (_) {}
}

// ── Path helpers ──────────────────────────────────────────────────────────────
function getServerExe() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'SmartAssess', 'SmartAssess.exe');
  }
  return path.join(__dirname, '..', '..', 'smart_assess', 'dist', 'SmartAssess', 'SmartAssess.exe');
}

function getIconPath() {
  return path.join(__dirname, '..', 'assets', 'icon.ico');
}

// ── Splash window ─────────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 600, height: 380,
    frame: false, transparent: false,
    resizable: false, center: true,
    alwaysOnTop: true, skipTaskbar: true,
    backgroundColor: '#1e293b',
    icon: getIconPath(),
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

// ── Main window ───────────────────────────────────────────────────────────────
function createMainWindow() {
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    x: state.x, y: state.y,
    width: state.width   || 1280,
    height: state.height || 820,
    minWidth: 900, minHeight: 600,
    show: false,
    backgroundColor: '#f1f5f9',
    icon: getIconPath(),
    title: APP_NAME,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  if (state.maximized) mainWindow.maximize();

  // ── Application menu ──────────────────────────────────────────────────────
  const { Menu: M } = require('electron');
  const menuTemplate = [
    {
      label: '&File',
      submenu: [
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+D',
          click: () => mainWindow?.loadURL(`http://127.0.0.1:${serverPort}/`) },
        { type: 'separator' },
        { label: 'Print', accelerator: 'CmdOrCtrl+P', click: () => triggerPrint() },
        { type: 'separator' },
        { label: 'Exit', accelerator: 'Alt+F4', click: () => quitApp() }
      ]
    },
    {
      label: '&View',
      submenu: [
        { label: 'Zoom In',          accelerator: 'CmdOrCtrl+=', click: () => adjustZoom(1) },
        { label: 'Zoom Out',         accelerator: 'CmdOrCtrl+-', click: () => adjustZoom(-1) },
        { label: 'Reset Zoom',       accelerator: 'CmdOrCtrl+0', click: () => setZoom(0) },
        { type: 'separator' },
        { label: 'Full Screen',      accelerator: 'F11',
          click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) },
        { label: 'Reload',           accelerator: 'F5', click: () => mainWindow?.reload() },
        { role: 'toggleDevTools',    accelerator: 'F12' }
      ]
    },
    {
      label: '&Help',
      submenu: [
        { label: `About ${APP_NAME}`, click: () => showAbout() },
        { label: 'User Guide', click: () => shell.openExternal('https://smartassess.app/docs') }
      ]
    }
  ];
  M.setApplicationMenu(M.buildFromTemplate(menuTemplate));

  // ── Window events ─────────────────────────────────────────────────────────
  mainWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow.hide(); }
    else saveWindowState(mainWindow);
  });
  mainWindow.on('resize', () => saveWindowState(mainWindow));
  mainWindow.on('move',   () => saveWindowState(mainWindow));
  mainWindow.on('closed', () => { mainWindow = null; });

  // Open external links in OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1`)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── Zoom ──────────────────────────────────────────────────────────────────────
let zoomLevel = 0;
function adjustZoom(d) { setZoom(zoomLevel + d); }
function setZoom(l) {
  zoomLevel = Math.max(-3, Math.min(3, l));
  mainWindow?.webContents.setZoomLevel(zoomLevel);
}

// ── Print ─────────────────────────────────────────────────────────────────────
// Ctrl+P / File > Print now opens the in-page preview modal first so the user
// can choose paper size and orientation before sending to the printer.
function triggerPrint() {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) return;
  win.webContents.executeJavaScript(
    'window.SmartPrintPreview && window.SmartPrintPreview.open()'
  );
}

// Called from the renderer via IPC once the user clicks "Print" in the modal.
// pageSize: 'A4' | 'A5' | 'Letter'   landscape: true | false
function printWithSettings({ pageSize = 'A4', landscape = false } = {}) {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) return;
  win.webContents.print({
    silent:          false,   // show OS print dialog for final confirmation
    printBackground: true,
    color:           true,
    pageSize,
    landscape,
  });
}

// ── About ─────────────────────────────────────────────────────────────────────
function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info', title: `About ${APP_NAME}`,
    icon: getIconPath(),
    message: APP_NAME,
    detail: `Version: ${APP_VERSION}\nPlatform: ${process.platform} ${os.arch()}\nElectron: ${process.versions.electron}\n\n© 2026 Smart Assess\nAll rights reserved.\n\nCompliant with Ghana Data Protection Act 2012 (Act 843)`,
    buttons: ['OK', 'Visit Website']
  }).then(r => { if (r.response === 1) shell.openExternal('https://smartassess.app'); });
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  const icon = nativeImage.createFromPath(getIconPath()).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip(`${APP_NAME} v${APP_VERSION}`);
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `${APP_NAME} v${APP_VERSION}`, enabled: false },
    { type: 'separator' },
    { label: 'Open', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: serverPort ? `Running on port ${serverPort}` : 'Starting...', enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => quitApp() }
  ]));
}

// ── Server ────────────────────────────────────────────────────────────────────
function cleanPortFiles() {
  [PORT_FILE_NEW, PORT_FILE_OLD].forEach(f => {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
  });
}

function startServer() {
  const exe = getServerExe();
  if (!fs.existsSync(exe)) {
    dialog.showErrorBox('Server Not Found',
      `Cannot find SmartAssess.exe at:\n${exe}\n\nPlease reinstall Smart Assess.`);
    app.quit(); return;
  }
  cleanPortFiles();
  serverProcess = spawn(exe, [], { detached: false, windowsHide: true, stdio: 'ignore' });
  serverProcess.on('error', err => dialog.showErrorBox('Server Error', err.message));
  serverProcess.on('exit', code => {
    if (!isQuitting && code !== 0) {
      dialog.showErrorBox('Server Stopped',
        `Smart Assess server stopped unexpectedly (code ${code}).\nPlease restart.`);
    }
  });
}

function waitForServer(onReady) {
  const started = Date.now();
  function poll() {
    if (Date.now() - started > START_TIMEOUT) {
      dialog.showErrorBox('Startup Timeout', 'Smart Assess took too long to start. Please try again.');
      app.quit(); return;
    }
    // Check both port file locations
    for (const portFile of [PORT_FILE_NEW, PORT_FILE_OLD]) {
      try {
        if (fs.existsSync(portFile)) {
          const data = JSON.parse(fs.readFileSync(portFile, 'utf8'));
          if (data.port) { serverPort = data.port; serverReady = true; onReady(serverPort); return; }
        }
      } catch (_) {}
    }
    setTimeout(poll, POLL_INTERVAL);
  }
  poll();
}

function openMainWindow() {
  if (!mainWindow) createMainWindow();
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
  mainWindow.webContents.once('did-finish-load', () => {
    if (splashWindow && !splashWindow.isDestroyed()) { splashWindow.close(); splashWindow = null; }
    mainWindow.show(); mainWindow.focus();
    updateTrayMenu();
  });
}

// ── Quit ──────────────────────────────────────────────────────────────────────
function quitApp() {
  isQuitting = true;
  globalShortcut.unregisterAll();
  if (serverProcess) {
    try {
      if (process.platform === 'win32') execSync(`taskkill /PID ${serverProcess.pid} /T /F`, { timeout: 3000 });
      else serverProcess.kill('SIGTERM');
    } catch (_) {}
  }
  cleanPortFiles();
  app.quit();
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('get-app-version',    () => APP_VERSION);
ipcMain.handle('trigger-print',         () => triggerPrint());
ipcMain.handle('print-with-settings',   (_, opts) => printWithSettings(opts));
ipcMain.handle('show-about',         () => showAbout());

// ── App lifecycle ─────────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });

  app.whenReady().then(() => {
    // Global shortcuts
    globalShortcut.register('CmdOrCtrl+P', () => triggerPrint());

    createSplash();
    createTray();
    startServer();
    waitForServer(() => openMainWindow());
  });

  app.on('window-all-closed', e => e.preventDefault()); // stay in tray
  app.on('before-quit', () => { isQuitting = true; });
  app.on('quit', () => {
    if (serverProcess) { try { serverProcess.kill(); } catch (_) {} }
    cleanPortFiles();
  });
}