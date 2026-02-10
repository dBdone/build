; -- feuer.iss --
; Feuer plugin installer

[Setup]
ArchitecturesInstallIn64BitMode=x64compatible 
ArchitecturesAllowed=x64compatible 
AppName=feuer
OutputBaseFilename="Feuer Installer"
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
Source: "VST3\Feuer.vst3\*"; DestDir: "{commoncf}\VST3\Feuer.vst3"; Flags: ignoreversion recursesubdirs; Components: main\feuerVST
Source: "AAX\Feuer.aaxplugin\*"; DestDir: "{commoncf}\Avid\Audio\Plug-Ins\Feuer.aaxplugin"; Flags: ignoreversion recursesubdirs; Components: main\feuerAAX


[Components]
Name: "base"; Description: "Base Installation"; Types: full custom compact custom; Flags: fixed
Name: "main"; Description: "Feuer Plugin"; Types: full custom compact; Flags: fixed
Name: "main\feuerVST"; Description: "Feuer Plugin (VST3)"; Types: full compact; Flags: dontinheritcheck
Name: "main\feuerAAX"; Description: "Feuer Plugin (AAX)"; Types: full; Flags: dontinheritcheck

[Run]
Filename: {tmp}\VC_redist.x64.exe; \
    Parameters: "/install /quiet /norestart"; \
    StatusMsg: "Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)"
