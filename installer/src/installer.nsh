; installer.nsh — Smart Assess v1.0.0 custom NSIS hooks

; ── Request admin elevation ───────────────────────────────────────────────────
!macro customHeader
  RequestExecutionLevel admin
!macroend

; ── Post-install: create AppData directories ──────────────────────────────────
!macro customInstall
  ; Create app data directory for server port file
  CreateDirectory "$APPDATA\SmartAssess"
  CreateDirectory "$APPDATA\GhanaSBA"

  ; Add Windows Firewall rule to allow localhost binding
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="SmartAssess" \
    dir=in action=allow program="$INSTDIR\Smart Assess.exe" enable=yes \
    profile=private,domain'
!macroend

; ── Pre-uninstall: clean up ────────────────────────────────────────────────────
!macro customUnInstall
  ; Remove server port files only (preserve user/school data)
  Delete "$APPDATA\SmartAssess\server.port"
  Delete "$APPDATA\GhanaSBA\server.port"

  ; Remove firewall rule
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="SmartAssess"'
!macroend
