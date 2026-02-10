!macro customUnInstall
  ; Remove auto-start registry entry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Sancho"

  ; Clean up installation directory completely
  RMDir /r "$INSTDIR"
!macroend
