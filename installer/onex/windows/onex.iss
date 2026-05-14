; -- onex.iss --
; Inno Setup template for ONE-X payload assembled by the external build pipeline.

[Setup]
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
AppName=ONE-X
OutputBaseFilename="ONE-X Installer"
AppVersion=1.0.0-0
WizardStyle=modern
DefaultDirName={autopf}\ONE-X
DefaultGroupName=ONE-X
Compression=zip
SolidCompression=yes
OutputDir=..
LicenseFile="..\..\..\installer\terms-of-service.rtf"

[Files]
Source: "app_support\*"; DestDir: "{commonappdata}\dBdone\onex"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "standalone\ONE-X.exe"; DestDir: "{app}\ONE-X Standalone"; DestName: "ONE-X-Standalone.exe"; Flags: ignoreversion
Source: "standalone\*"; DestDir: "{app}\ONE-X Standalone"; Excludes: "ONE-X.exe"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "editor\*"; DestDir: "{app}\ONE-X Editor"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "plugins\vst3\ONE-X.vst3\*"; DestDir: "{commoncf}\VST3\ONE-X.vst3"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "plugins\aax\ONE-X.aaxplugin\*"; DestDir: "{commoncf}\Avid\Audio\Plug-Ins\ONE-X.aaxplugin"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\ONE-X Standalone"; Filename: "{app}\ONE-X Standalone\ONE-X-Standalone.exe"
Name: "{group}\ONE-X Editor"; Filename: "{app}\ONE-X Editor\OneX_Editor.exe"
