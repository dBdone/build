<#
.SYNOPSIS
  build dBdone plugin.

.PARAMETER Version
  Release version, e.g. 1.2.3-4
#>

param(
  [Parameter(Mandatory)][string]$Version
)


$MSBUILD = "C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe"
$NATIVE_ROOT = "..\..\native"
$BUILD_FOLDER = "$NATIVE_ROOT\plugins\dbdone\Builds\VisualStudio2022"
$AAX_KEYFILE = "..\..\Orga\aax_cert.p12"



# Write the version header
Write-Host ("Creating version header...")

$VERSION_HEADER_CONTENT = @(
  '#pragma once'
  ''
  "#define SYSTEM_VERSION `"$Version`""
)

try {
  $VERSION_HEADER_CONTENT | Set-Content -LiteralPath $VERSION_HEADER_FILE -Encoding UTF8
  Write-Host "Successfully wrote $VERSION_HEADER_FILE with SYSTEM_VERSION = `"$Version`"."
}
catch {
  Write-Error "Failed to write $VERSION_HEADER_FILE"
  exit 1
}

Write-Host ("Running Projucer...")
$PROJUCER = "C:\JUCE\JUCE\Projucer.exe"

Start-Process -FilePath $PROJUCER `
  -ArgumentList @('--resave', "$NATIVE_ROOT\plugins\dbdone\dbdone.jucer") `
  -Wait -NoNewWindow -PassThru | Out-Null


Push-Location $BUILD_FOLDER
try {
  & "$MSBUILD" 'dbdone.sln' '/p:Configuration=Release' '/t:Clean' '/v:m'
  if ($LASTEXITCODE -ne 0) { throw "MSBuild clean failed (code $LASTEXITCODE)" }

  & "$MSBUILD" 'dbdone.sln' '/p:Configuration=Release' '/p:Platform=x64' '/v:m'
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
$aaxOut = '.\dbdone.aaxplugin'
if (Test-Path $aaxOut) { Remove-Item $aaxOut -Force }

# Sign the plugin
& wraptool sign `
  --verbose `
  --account 'wschneider@nexoft.de' `
  --password '_Vorsicht007' `
  --wcguid 'E5E1C370-0251-11F0-BCC1-00505692AD3E' `
  --keyfile $AAX_KEYFILE `
  --keypassword 'dbdone-1328' `
  --in "$BUILD_FOLDER\x64\Release\AAX\dbdone.aaxplugin\Contents\x64\dbdone.aaxplugin" `
  --out $aaxOut `
  --autoinstall on

if ($LASTEXITCODE -ne 0) {
  Write-Error "wraptool sign failed (code $LASTEXITCODE)"
  exit 1
}

# Move signed plugin into place
try {
  Move-Item -LiteralPath $aaxOut -Destination "$BUILD_FOLDER\x64\Release\AAX\dbdone.aaxplugin\Contents\x64\" -Force
  Write-Host 'Signed AAX plugin copied.'
}
catch {
  Write-Error "Failed to move signed plugin: $_"
  exit 1
}