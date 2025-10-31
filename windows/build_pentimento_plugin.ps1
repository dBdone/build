<#
.SYNOPSIS
  Build the plugin via MSBuild for a given version.
.PARAMETER Version
  Version string to embed in the .iss script, e.g. 1.2.3-456
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Version
)



$MSBUILD = "C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe"
$NATIVE_ROOT = "..\..\native"
$BUILD_FOLDER = "$NATIVE_ROOT\plugins\pentimento\Builds\VisualStudio2022"
$AAX_KEYFILE = "..\..\Orga\aax_cert.p12"

# Patch version in Projucer project file
$JUCER_FILE = "$NATIVE_ROOT\plugins\pentimento\pentimento.jucer"
Write-Host ("Patching version in Projucer project file...")
[xml]$jucerXml = Get-Content $JUCER_FILE
$jucerProject = $jucerXml.SelectSingleNode("//JUCERPROJECT")
if ($jucerProject -and $jucerProject.HasAttribute("version")) {
  $newVersion = $Version
  $oldVersion = $jucerProject.GetAttribute("version")
  $jucerProject.SetAttribute("version", $newVersion)
  $jucerXml.Save($JUCER_FILE)
  Write-Host ("Updated version from $oldVersion to $newVersion")
}
else {
  Write-Warning "Could not find version attribute in Projucer project file"
}

Write-Host ("Running Projucer...")
$PROJUCER = "C:\JUCE\JUCE\Projucer.exe"

Start-Process -FilePath $PROJUCER `
  -ArgumentList @('--resave', "$NATIVE_ROOT\plugins\pentimento\pentimento.jucer") `
  -Wait -NoNewWindow -PassThru | Out-Null



Push-Location $BUILD_FOLDER
try {
  & "$MSBUILD" 'pentimento.sln' '/p:Configuration=Release' '/t:Clean' '/v:m'
  if ($LASTEXITCODE -ne 0) { throw "MSBuild clean failed (code $LASTEXITCODE)" }

  & "$MSBUILD" 'pentimento.sln' '/p:Configuration=Release' '/p:Platform=x64' '/v:m'
  if ($LASTEXITCODE -ne 0) { throw "MSBuild build failed (code $LASTEXITCODE)" }
  Write-Host 'Plugin build completed successfully.'
  Pop-Location
}
catch {
  Write-Error $_
  Pop-Location
  exit 1
}


# Remove existing AAX bundle if present
$aaxOut = '.\pentimento.aaxplugin'
if (Test-Path $aaxOut) { Remove-Item $aaxOut -Force }

# Sign the plugin
& wraptool sign `
  --verbose `
  --account 'wschneider@nexoft.de' `
  --password '_Vorsicht007' `
  --wcguid 'E5E1C370-0251-11F0-BCC1-00505692AD3E' `
  --keyfile $AAX_KEYFILE `
  --keypassword 'dbdone-1328' `
  --in "$BUILD_FOLDER\x64\Release\AAX\pentimento.aaxplugin\Contents\x64\pentimento.aaxplugin" `
  --out $aaxOut `
  --autoinstall on

if ($LASTEXITCODE -ne 0) {
  Write-Error "wraptool sign failed (code $LASTEXITCODE)"
  exit 1
}

# Move signed plugin into place
try {
  Move-Item -LiteralPath $aaxOut -Destination "$BUILD_FOLDER\x64\Release\AAX\pentimento.aaxplugin\Contents\x64\" -Force
  Write-Host 'Signed AAX plugin copied.'
}
catch {
  Write-Error "Failed to move signed plugin: $_"
  exit 1
}