!macro customInit
  ; Clean up orphaned registry if install dir was manually deleted
  ${ifNot} ${FileExists} "$INSTDIR"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{${UNINSTALL_APP_KEY}}"
  ${EndIf}
!macroend

!macro customInstall
  ; Force-kill Sancho if running (tray / background)
  ; Use ExecToStack instead of ExecToLog — ExecToLog hangs in silent (/S) mode
  nsExec::ExecToStack 'taskkill /F /IM "Sancho.exe"'
  Pop $0
  nsExec::ExecToStack 'taskkill /F /IM "main.exe"'
  Pop $0
  Sleep 2000
!macroend

!macro customUnInstall
  ; Force-kill Sancho if running
  nsExec::ExecToStack 'taskkill /F /IM "Sancho.exe"'
  Pop $0
  nsExec::ExecToStack 'taskkill /F /IM "main.exe"'
  Pop $0
  Sleep 1000

  ; Remove auto-start registry entry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Sancho"

  ; Clean up installation directory completely
  RMDir /r "$INSTDIR"
!macroend
