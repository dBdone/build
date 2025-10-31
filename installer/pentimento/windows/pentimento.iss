; -- pentimento.iss --
; Demonstrates copying 3 files and creating an icon.

; SEE THE DOCUMENTATION FOR DETAILS ON CREATING .ISS SCRIPT FILES!

[Setup]
ArchitecturesInstallIn64BitMode=x64compatible 
ArchitecturesAllowed=x64compatible 
AppName=pentimento
OutputBaseFilename="Pentimento Installer"
AppVersion=0.9.1-5
WizardStyle=modern
DefaultDirName={autopf}\dBdone
DefaultGroupName=dBdone
;UninstallDisplayIcon={app}\MyProg.exe
Compression=zip
SolidCompression=yes
OutputDir=..
LicenseFile="..\..\..\installer\terms-of-service.rtf"

[Files]
Source: "..\..\..\installer\VC_redist.x64.exe"; DestDir: {tmp}; Flags: deleteafterinstall; Components: main
Source: "VST3\Pentimento.vst3\*"; DestDir: "{commoncf}\VST3\Pentimento.vst3"; Flags: ignoreversion recursesubdirs; Components: main\pentimentoVST
Source: "AAX\Pentimento.aaxplugin\*"; DestDir: "{commoncf}\Avid\Audio\Plug-Ins\Pentimento.aaxplugin"; Flags: ignoreversion recursesubdirs; Components: main\pentimentoAAX
Source: "Backend\dbdone_backend.dll"; DestDir: "{commonappdata}\dBdone\pentimento"; Flags: ignoreversion
Source: "Content\packs\*"; DestDir: "{commonappdata}\dBdone\pentimento\packs"; Flags: ignoreversion recursesubdirs; Components: packs

;will produce warnings, since installation is system-wide and deinstall requires per-user mode
;[UninstallDelete]
;Type: filesandordirs; Name: "{userappdata}\com.dbdone"

[Components]
Name: "base"; Description: "Base Installation"; Types: full custom compact custom; Flags: fixed
Name: "packs"; Description: "Sample Packs"; Types: full custom compact custom; Flags: fixed
Name: "main"; Description: "Pentimento Plugin"; Types: full custom compact; Flags: fixed
Name: "main\pentimentoVST"; Description: "Pentimento Plugin (VST3)"; Types: full compact; Flags: dontinheritcheck
Name: "main\pentimentoAAX"; Description: "Pentimento Plugin (AAX)"; Types: full; Flags: dontinheritcheck

[Run]
Filename: {tmp}\VC_redist.x64.exe; \
    Parameters: "/install /quiet /norestart"; \
    StatusMsg: "Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)"

