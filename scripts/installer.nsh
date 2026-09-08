; scripts/installer.nsh - fuerza instalacion solo per-user (CurrentUser)
; Mantiene oneClick:false con header/sidebar pero oculta la pagina "Elegir opciones de instalacion"
; Ver multiUserUi.nsh: isForceCurrentInstall == 1 => Abort PAGE_INSTALL_MODE
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
  StrCpy $isForceMachineInstall "0"
!macroend