; -- dbdone.iss --
; Demonstrates copying 3 files and creating an icon.

; SEE THE DOCUMENTATION FOR DETAILS ON CREATING .ISS SCRIPT FILES!

[Setup]
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64
AppName=dBdone
OutputBaseFilename="dBdone Installer"
AppVersion=9.9.9+99
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
Source: "..\..\..\native\app\build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs; Components: main
Source: "..\..\..\native\components\dbDoneBackend\lib\Release\dbdone_backend.dll"; DestDir: "{commonappdata}\dBdone\app"; Flags: ignoreversion; Components: main
Source: "..\..\..\native\plugins\dbdone\Builds\VisualStudio2022\x64\Release\VST3\dbdone.vst3\*"; DestDir: "{commoncf}\VST3\dbdone.vst3"; Flags: ignoreversion recursesubdirs; Components: plugins\dbdoneVST
Source: "..\..\..\native\plugins\dbdone\Builds\VisualStudio2022\x64\Release\AAX\dbdone.aaxplugin\*"; DestDir: "{commoncf}\Avid\Audio\Plug-Ins\dbdone.aaxplugin"; Flags: ignoreversion recursesubdirs; Components: plugins\dbdoneAAX

;will produce warnings, since installation is system-wide and deinstall requires per-user mode
;[UninstallDelete]
;Type: filesandordirs; Name: "{userappdata}\com.dbdone"

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
