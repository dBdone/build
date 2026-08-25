; -- wasser.iss --
; Wasser plugin installer

[Setup]
ArchitecturesInstallIn64BitMode=x64compatible 
ArchitecturesAllowed=x64compatible 
AppName=wasser
OutputBaseFilename="Wasser Installer"
AppVersion=0.9.1-5
WizardStyle=modern
DefaultDirName={commonappdata}\dBdone
UsePreviousAppDir=no
DisableDirPage=yes
DefaultGroupName=dBdone
Compression=zip
SolidCompression=yes
OutputDir=..
LicenseFile="..\..\..\installer\terms-of-service.rtf"

[Files]
Source: "..\..\..\installer\VC_redist.x64.exe"; DestDir: {tmp}; Flags: deleteafterinstall; Components: main
Source: "VST3\Wasser.vst3\*"; DestDir: "{commoncf}\VST3\Wasser.vst3"; Flags: ignoreversion recursesubdirs; Components: main\wasserVST
Source: "AAX\Wasser.aaxplugin\*"; DestDir: "{commoncf}\Avid\Audio\Plug-Ins\Wasser.aaxplugin"; Flags: ignoreversion recursesubdirs; Components: main\wasserAAX
Source: "Content\presets\*"; DestDir: "{commonappdata}\dBdone\wasser\presets"; Flags: ignoreversion recursesubdirs; Components: presets


[Components]
Name: "base"; Description: "Base Installation"; Types: full custom compact custom; Flags: fixed
Name: "presets"; Description: "Factory Presets"; Types: full custom compact custom; Flags: fixed
Name: "main"; Description: "Wasser Plugin"; Types: full custom compact; Flags: fixed
Name: "main\wasserVST"; Description: "Wasser Plugin (VST3)"; Types: full compact; Flags: dontinheritcheck
Name: "main\wasserAAX"; Description: "Wasser Plugin (AAX)"; Types: full; Flags: dontinheritcheck

[Run]
Filename: {tmp}\VC_redist.x64.exe; \
    Parameters: "/install /quiet /norestart"; \
    StatusMsg: "Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)"
