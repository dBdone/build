; -- glas.iss --
; Glas plugin installer

[Setup]
ArchitecturesInstallIn64BitMode=x64compatible 
ArchitecturesAllowed=x64compatible 
AppName=glas
OutputBaseFilename="Glas Installer"
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
Source: "VST3\Glas.vst3\*"; DestDir: "{commoncf}\VST3\Glas.vst3"; Flags: ignoreversion recursesubdirs; Components: main\glasVST
Source: "AAX\Glas.aaxplugin\*"; DestDir: "{commoncf}\Avid\Audio\Plug-Ins\Glas.aaxplugin"; Flags: ignoreversion recursesubdirs; Components: main\glasAAX
Source: "Backend\dbdone_backend.dll"; DestDir: "{commonappdata}\dBdone\glas"; Flags: ignoreversion

[Components]
Name: "base"; Description: "Base Installation"; Types: full custom compact custom; Flags: fixed
Name: "main"; Description: "Glas Plugin"; Types: full custom compact; Flags: fixed
Name: "main\glasVST"; Description: "Glas Plugin (VST3)"; Types: full compact; Flags: dontinheritcheck
Name: "main\glasAAX"; Description: "Glas Plugin (AAX)"; Types: full; Flags: dontinheritcheck

[Run]
Filename: {tmp}\VC_redist.x64.exe; \
    Parameters: "/install /quiet /norestart"; \
    StatusMsg: "Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)"
