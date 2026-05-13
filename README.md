# Smart Assess — Installer Build System

## What this produces

One distributable file: **`Smart Assess Setup 3.1.0.exe`**

When a school installs it, they get:
- A professional multi-page install wizard with your logo and T&Cs
- The Django + Waitress server (built by PyInstaller)
- An Electron shell that launches the server and opens it in a dedicated window
- Desktop shortcut + Start Menu entry
- System tray icon with quick access

---

## Prerequisites (build machine — one-time setup)

| Tool | Download |
|------|----------|
| Python 3.11+ | https://python.org |
| Node.js 18+ | https://nodejs.org |
| PyInstaller | `pip install pyinstaller` |
| electron-builder | installed by `npm install` |

---

## Build steps

```
smart_assess/          ← your existing Django project
smart_assess_installer/
  build.bat            ← run this
  installer/
    package.json
    assets/
      banner.png       ← your logo image
      icon_256.png     ← app icon
      license.txt      ← T&Cs shown during install
    src/
      main.js          ← Electron runtime (runs after install)
      installer_main.js← Electron installer wizard
      installer.html   ← wizard UI
      splash.html      ← loading screen
```

### Option A — One command
```bat
cd smart_assess
..\smart_assess_installer\build.bat
```

### Option B — Manual steps

**Step 1: Build the Django server (PyInstaller)**
```bat
cd smart_assess
pip install pyinstaller django openpyxl waitress
pyinstaller ghana_sba.spec --clean --noconfirm
```
Output: `smart_assess/dist/sba_server/sba_server.exe`

**Step 2: Build the Electron installer**
```bat
cd smart_assess_installer/installer
npm install
npm run build
```
Output: `smart_assess_installer/installer/dist/Smart Assess Setup 3.1.0.exe`

---

## Installer wizard pages

| Page | Content |
|------|---------|
| 1 Welcome | Logo banner, app name, feature highlights |
| 2 Terms & Conditions | Full scrollable licence text with accept checkbox |
| 3 Install Location | Directory picker, shortcut options, startup option |
| 4 Installing | Animated progress bar with live log output |
| 5 Finish | Success screen with "Launch now" checkbox |

---

## What the installer includes

The `extraResources` in `package.json` tells electron-builder to bundle
`smart_assess/dist/sba_server/` into the installer. When the user installs:

1. Electron unpacks to the chosen directory
2. `sba_server.exe` (PyInstaller bundle) is placed in `resources/sba_server/`
3. `main.js` spawns `sba_server.exe` on launch
4. Server writes a port file to `%APPDATA%\GhanaSBA\server.port`
5. Electron reads the port and opens `http://127.0.0.1:{port}/` in a window
6. A system tray icon stays in the taskbar while the app is open

---

## Customising

| File | What to change |
|------|---------------|
| `assets/banner.png` | Splash/installer logo image |
| `assets/icon_256.png` | App icon (also used for tray) |
| `assets/license.txt` | T&Cs text shown to user |
| `src/installer.html` | Wizard UI — all pages |
| `src/splash.html` | Loading screen shown on app start |
| `package.json` → `version` | Version number |
| `package.json` → `build.nsis` | Installer options |
