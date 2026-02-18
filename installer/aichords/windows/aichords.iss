; -- aichords.iss --

[Setup]
ArchitecturesInstallIn64BitMode=x64compatible 
ArchitecturesAllowed=x64compatible 
AppName=aichords
OutputBaseFilename="Aichords Installer"
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
Source: "VST3\Aichords.vst3\*"; DestDir: "{commoncf}\VST3\Aichords.vst3"; Flags: ignoreversion recursesubdirs; Components: main\aichordsVST
Source: "AAX\Aichords.aaxplugin\*"; DestDir: "{commoncf}\Avid\Audio\Plug-Ins\Aichords.aaxplugin"; Flags: ignoreversion recursesubdirs; Components: main\aichordsAAX
Source: "Backend\dbdone_backend.dll"; DestDir: "{commonappdata}\dBdone\aichords"; Flags: ignoreversion
Source: "Content\sound\player.sf2"; DestDir: "{commonappdata}\dBdone\aichords\sound"; Flags: ignoreversion; Components: sound

[Components]
Name: "base"; Description: "Base Installation"; Types: full custom compact custom; Flags: fixed
Name: "sound"; Description: "Sound Assets"; Types: full custom compact custom; Flags: fixed
Name: "main"; Description: "Aichords Plugin"; Types: full custom compact; Flags: fixed
Name: "main\aichordsVST"; Description: "Aichords Plugin (VST3)"; Types: full compact; Flags: dontinheritcheck
Name: "main\aichordsAAX"; Description: "Aichords Plugin (AAX)"; Types: full; Flags: dontinheritcheck

[Run]
Filename: {tmp}\VC_redist.x64.exe; \
    Parameters: "/install /quiet /norestart"; \
    StatusMsg: "Installing Microsoft Visual C++ 2015-2022 Redistributable (x64)"
