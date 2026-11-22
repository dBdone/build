; -- dbdone.iss --
; Installer for dBdone app and plugins

; SEE THE DOCUMENTATION FOR DETAILS ON CREATING .ISS SCRIPT FILES!

; Source checkouts, relative to this folder; override with
;   ISCC /DAppRoot=..\..\..\..\native\app dbdone.iss
; App 1.5 (app, plugin and backend library) is built in the ux-2026-demo worktree
; (cloud_mika docs/APP-INTEGRATION.md); build it with NATIVE_ROOT set to that folder.
#ifndef AppRoot
  #define AppRoot "..\..\..\..\native-ux-2026-demo\app"
#endif
#ifndef NativeRoot
  #define NativeRoot "..\..\..\..\native-ux-2026-demo"
#endif

[Setup]
ArchitecturesInstallIn64BitMode=x64compatible 
ArchitecturesAllowed=x64compatible 
AppName=dBdone
OutputBaseFilename="dBdone Installer"
AppVersion=1.3.0-42
WizardStyle=modern
DefaultDirName={autopf}\dBdone
DefaultGroupName=dBdone
;UninstallDisplayIcon={app}\MyProg.exe
Compression=zip
SolidCompression=yes
OutputDir=..\..\..\dist\app
LicenseFile="..\..\..\installer\terms-of-service.rtf"

[Files]
Source: "..\..\..\installer\VC_redist.x64.exe"; DestDir: {tmp}; Flags: deleteafterinstall; Components: main
Source: "{#AppRoot}\build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs; Components: main
Source: "{#NativeRoot}\plugins\dbdone\Builds\VisualStudio2022\x64\Release\VST3\dbdone.vst3\*"; DestDir: "{commoncf}\VST3\dbdone.vst3"; Flags: ignoreversion recursesubdirs; Components: plugins\dbdoneVST
Source: "{#NativeRoot}\plugins\dbdone\Builds\VisualStudio2022\x64\Release\AAX\dbdone.aaxplugin\*"; DestDir: "{commoncf}\Avid\Audio\Plug-Ins\dbdone.aaxplugin"; Flags: ignoreversion recursesubdirs; Components: plugins\dbdoneAAX
Source: "{#NativeRoot}\components\dbDoneBackend\Builds\VisualStudio2022\x64\Release\Dynamic Library\dbdone_backend.dll"; DestDir: "{commonappdata}\dBdone\dbdone-app"; Flags: ignoreversion

;will produce warnings, since installation is system-wide and deinstall requires per-user mode
;[UninstallDelete]
;Type: filesandordirs; Name: "{userappdata}\com.dbdone"

[Registry]
; dbdone://activate links from "My products" (cloud_mika docs/APP-INTEGRATION.md).
; Per machine, so the uninstaller removes it (uninsdeletekey); the app only writes
; its own per-user key when this one is missing (dev / unpacked builds).
Root: HKLM; Subkey: "Software\Classes\dbdone"; ValueType: string; ValueName: ""; ValueData: "URL:dBdone"; Flags: uninsdeletekey; Components: main
Root: HKLM; Subkey: "Software\Classes\dbdone"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""; Components: main
Root: HKLM; Subkey: "Software\Classes\dbdone\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\dBdone.exe"",0"; Components: main
Root: HKLM; Subkey: "Software\Classes\dbdone\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\dBdone.exe"" ""%1"""; Components: main

[Components]
Name: "main"; Description: "dbDone App"; Types: full custom compact; Flags: fixed
Name: "plugins"; Description: "Plugins"; Types: full
Name: "plugins\dbdoneVST"; Description: "dBdone Plugin (VST3)"; Types: full compact
Name: "plugins\dbdoneAAX"; Description: "dBdone Plugin (AAX)"; Types: full

[Run]
Filename: {tmp}\VC_redist.x64.exe; \
    Parameters: "/install /quiet /norestart"; \
    StatusMsg: "Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)"

[Icons]
Name: "{group}\dBdone"; Filename: "{app}\dBdone.exe"
