
<#
.SYNOPSIS
  Build the Windows installer via Inno Setup for a given version.
.PARAMETER Version
  Version string to embed in the .iss script, e.g. 1.2.3-456
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Version
)

$INSTALLER_FILE = ".\pentimento.iss"
$ISCC = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
$SIGNTOOL = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x86\signtool.exe"
$OUTPUT_DIR = ".\output"  

try {
  (Get-Content $INSTALLER_FILE) -replace '^AppVersion=.*', "AppVersion=$Version" |
  Set-Content -LiteralPath $INSTALLER_FILE -Encoding UTF8
  Write-Host "Successfully patched $INSTALLER_FILE"
}
catch {
  Write-Error "Failed to patch $INSTALLER_FILE - $_"
  exit 1
}

Write-Host "crafting terms of service document..."
pandoc -s -f gfm -t rtf -o terms-of-service.rtf ../../terms.md


# Clean output directory
if (Test-Path $OUTPUT_DIR) {
  Write-Host "Cleaning output directory: $OUTPUT_DIR"
  Remove-Item "$OUTPUT_DIR\*" -Recurse -Force -ErrorAction SilentlyContinue
}

# Path to Inno Setup Compiler
Write-Host 'Building installer...'
try {
  & $ISCC $INSTALLER_FILE
  if ($LASTEXITCODE -ne 0) { throw "ISCC exited with code $LASTEXITCODE" }
  Write-Host 'Installer built successfully.'
}
catch {
  Write-Error "Inno Setup compilation failed: $_"
  exit 1
}


Write-Host 'Signing installer...'
& $SIGNTOOL sign `
  /fd sha256 `
  /tr http://ts.ssl.com `
  /td sha256 `
  /sha1 6B428DAFA4A8C9BD4027CE8EE87E035C7DE09B5F `
  "$OUTPUT_DIR\Pentimento Installer.exe"

