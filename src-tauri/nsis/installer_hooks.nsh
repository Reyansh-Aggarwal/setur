!include "MUI2.nsh"

Var AutostartCheckbox

!define MUI_PAGE_CUSTOMFUNCTION_PRE AddAutostartCheckbox
!insertmacro MUI_PAGE_INSTFILES

Function AddAutostartCheckbox
    ${NSD_CreateCheckbox} 10u -30u 200u 10u "Launch Setur on startup"
    Pop $AutostartCheckbox
    ${NSD_SetState} $AutostartCheckbox ${BST_CHECKED}
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
    ${NSD_GetState} $AutostartCheckbox $0
    ${If} $0 == ${BST_CHECKED}
        WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Setur" "$INSTDIR\setur.exe"
    ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Setur"
!macroend
