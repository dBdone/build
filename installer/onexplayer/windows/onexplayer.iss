; -- onexplayer.iss --
; Inno Setup template for the ONE-X Player (plugin-only) payload assembled by the external build pipeline.

[Setup]
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
AppName=ONE-X Player
OutputBaseFilename="ONE-X Player Installer"
AppVersion=1.0.0-0
WizardStyle=modern
DefaultDirName={autopf}\ONE-X Player
DefaultGroupName=ONE-X Player
Compression=zip
SolidCompression=yes
OutputDir=..
LicenseFile="..\..\..\installer\terms-of-service.rtf"

[Files]
Source: "app_support\*"; DestDir: "{commonappdata}\dBdone\onex"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "plugins\vst3\ONE-X.vst3\*"; DestDir: "{commoncf}\VST3\ONE-X.vst3"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "plugins\aax\ONE-X.aaxplugin\*"; DestDir: "{commoncf}\Avid\Audio\Plug-Ins\ONE-X.aaxplugin"; Flags: ignoreversion recursesubdirs createallsubdirs
