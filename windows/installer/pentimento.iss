; -- pentimento.iss --
; Demonstrates copying 3 files and creating an icon.

; SEE THE DOCUMENTATION FOR DETAILS ON CREATING .ISS SCRIPT FILES!

[Setup]
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64
AppName=pentimento
OutputBaseFilename="Pentimento Installer"
AppVersion=0.9.0-16
WizardStyle=modern
DefaultDirName={autopf}\dBdone
DefaultGroupName=dBdone
;UninstallDisplayIcon={app}\MyProg.exe
Compression=zip
SolidCompression=yes
;OutputDir=userdocs:Inno Setup Examples Output
LicenseFile="terms-of-service.rtf"

[Files]
Source: "VC_redist.x64.exe"; DestDir: {tmp}; Flags: deleteafterinstall; Components: main
Source: "..\..\..\native\plugins\pentimento\Builds\VisualStudio2022\x64\Release\VST3\pentimento.vst3\*"; DestDir: "{commoncf}\VST3\pentimento.vst3"; Flags: ignoreversion recursesubdirs; Components: main\pentimentoVST
Source: "..\..\..\native\plugins\pentimento\Builds\VisualStudio2022\x64\Release\AAX\pentimento.aaxplugin\*"; DestDir: "{commoncf}\Avid\Audio\Plug-Ins\pentimento.aaxplugin"; Flags: ignoreversion recursesubdirs; Components: main\pentimentoAAX
Source: "..\..\..\native\components\dbDoneBackend\lib\Release\dbdone_backend.dll"; DestDir: "{commonappdata}\dBdone\pentimento"; Flags: ignoreversion recursesubdirs
Source: "..\..\common\pentimento\packs\*"; DestDir: "{commonappdata}\dBdone\pentimento\packs"; Flags: ignoreversion recursesubdirs; Components: packs

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

