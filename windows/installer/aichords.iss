; -- aichords.iss --
; Demonstrates copying 3 files and creating an icon.

; SEE THE DOCUMENTATION FOR DETAILS ON CREATING .ISS SCRIPT FILES!

[Setup]
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64
AppName=aichords
OutputBaseFilename="AIChords Installer"
AppVersion=0.9.0-1
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
Source: "..\..\..\native\plugins\aichords\Builds\VisualStudio2022\x64\Release\VST3\aichords.vst3\*"; DestDir: "{commoncf}\VST3\aichords.vst3"; Flags: ignoreversion recursesubdirs; Components: main\aichordsVST
Source: "..\..\..\native\plugins\aichords\Builds\VisualStudio2022\x64\Release\AAX\aichords.aaxplugin\*"; DestDir: "{commoncf}\Avid\Audio\Plug-Ins\aichords.aaxplugin"; Flags: ignoreversion recursesubdirs; Components: main\aichordsAAX
Source: "..\..\..\native\components\dbDoneBackend\lib\Release\dbdone_backend.dll"; DestDir: "{commonappdata}\dBdone\aichords"; Flags: ignoreversion recursesubdirs
Source: "..\..\common\aichords\sound\*"; DestDir: "{commonappdata}\dBdone\aichords\sound"; Flags: ignoreversion recursesubdirs; Components: sound

;will produce warnings, since installation is system-wide and deinstall requires per-user mode
;[UninstallDelete]
;Type: filesandordirs; Name: "{userappdata}\com.dbdone"

[Components]
Name: "sound"; Description: "Piano Sound"; Types: full custom compact custom; Flags: fixed
Name: "main"; Description: "AI Chords Plugin"; Types: full custom compact; Flags: fixed
Name: "main\aichordsVST"; Description: "AI Chords Plugin (VST3)"; Types: full compact; Flags: dontinheritcheck
Name: "main\aichordsAAX"; Description: "AI Chords Plugin (AAX)"; Types: full; Flags: dontinheritcheck

[Run]
Filename: {tmp}\VC_redist.x64.exe; \
    Parameters: "/install /quiet /norestart"; \
    StatusMsg: "Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)"

