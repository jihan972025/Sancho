!macro customInstall
  ; Force-kill Sancho if running (tray / background)
  nsExec::ExecToLog 'taskkill /F /IM "Sancho.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "main.exe"'
  Sleep 1000
!macroend

!macro customUnInstall
  ; Force-kill Sancho if running
  nsExec::ExecToLog 'taskkill /F /IM "Sancho.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "main.exe"'
  Sleep 1000

  ; Remove auto-start registry entry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Sancho"

  ; Clean up installation directory completely
  RMDir /r "$INSTDIR"
!macroend
