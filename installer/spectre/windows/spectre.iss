; -- spectre.iss --
; Spectre plugin installer

[Setup]
ArchitecturesInstallIn64BitMode=x64compatible 
ArchitecturesAllowed=x64compatible 
AppName=spectre
OutputBaseFilename="Spectre Installer"
AppVersion=0.9.1-5
WizardStyle=modern
DefaultDirName={autopf}\dBdone
DefaultGroupName=dBdone
Compression=zip
SolidCompression=yes
OutputDir=..
LicenseFile="..\..\..\installer\terms-of-service.rtf"

[Files]
Source: "..\..\..\installer\VC_redist.x64.exe"; DestDir: {tmp}; Flags: deleteafterinstall; Components: main
Source: "VST3\Spectre.vst3\*"; DestDir: "{commoncf}\VST3\Spectre.vst3"; Flags: ignoreversion recursesubdirs; Components: main\spectreVST
Source: "AAX\Spectre.aaxplugin\*"; DestDir: "{commoncf}\Avid\Audio\Plug-Ins\Spectre.aaxplugin"; Flags: ignoreversion recursesubdirs; Components: main\spectreAAX
Source: "Backend\dbdone_backend.dll"; DestDir: "{commonappdata}\dBdone\spectre"; Flags: ignoreversion

[Components]
Name: "base"; Description: "Base Installation"; Types: full custom compact custom; Flags: fixed
Name: "main"; Description: "Spectre Plugin"; Types: full custom compact; Flags: fixed
Name: "main\spectreVST"; Description: "Spectre Plugin (VST3)"; Types: full compact; Flags: dontinheritcheck
Name: "main\spectreAAX"; Description: "Spectre Plugin (AAX)"; Types: full; Flags: dontinheritcheck

[Run]
Filename: {tmp}\VC_redist.x64.exe; \
    Parameters: "/install /quiet /norestart"; \
    StatusMsg: "Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)"
