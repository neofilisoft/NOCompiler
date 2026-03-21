!macro customInstall
  WriteRegStr HKCR "*\shell\Open with VE Code" "" "Open with VE Code"
  WriteRegStr HKCR "*\shell\Open with VE Code" "Icon" "$INSTDIR\\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCR "*\shell\Open with VE Code\command" "" '"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr HKCR "Directory\shell\Open with VE Code" "" "Open with VE Code"
  WriteRegStr HKCR "Directory\shell\Open with VE Code" "Icon" "$INSTDIR\\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCR "Directory\shell\Open with VE Code\command" "" '"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr HKCR "Directory\Background\shell\Open with VE Code" "" "Open with VE Code"
  WriteRegStr HKCR "Directory\Background\shell\Open with VE Code" "Icon" "$INSTDIR\\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCR "Directory\Background\shell\Open with VE Code\command" "" '"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "%V"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCR "*\shell\Open with VE Code"
  DeleteRegKey HKCR "Directory\shell\Open with VE Code"
  DeleteRegKey HKCR "Directory\Background\shell\Open with VE Code"
!macroend
