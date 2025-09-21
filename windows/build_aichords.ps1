# Path to MSBuild executable
$NATIVE_ROOT = "..\..\native"
$FAKE_VERSION = "9.9.9+99"
$VERSION_HEADER_FILE = "$NATIVE_ROOT\plugins\aichords\Source\version.h"
$INSTALLER_DIR = ".\installer"


#=== helper: prompt for a choice ===#
function Show-Menu {
  param(
    [string]$Title,
    [string[]]$Options
  )

  Write-Host $Title
  for ($i = 0; $i -lt $Options.Length; $i++) {
    # number them 1,2,3…
    Write-Host "  [$($i+1)] $($Options[$i])"
  }

  do {
    $choice = Read-Host "Enter choice [1-$($Options.Length)]"
    $valid = ($choice -as [int]) -and ($choice -ge 1) -and ($choice -le $Options.Length)
    if (-not $valid) { Write-Host "Invalid selection, try again." -ForegroundColor Red }
  } while (-not $valid)

  return ([int]$choice - 1)   # zero‑based index
}

# get git version:
Write-Host 'Getting version from git tags...'
Push-Location $NATIVE_ROOT
& git fetch --tags | Out-Null

# get all semver+build tags, sort by semver
$tags = @(& git tag --list 'AICHORDS_V[0-9]*.[0-9]*.[0-9]*[-+][0-9]*' --sort=v:refname)
$latestTag = if ($tags) { $tags[-1].Trim() } else { '' }

# commit hash and message
$commitHash = (& git rev-list -n 1 $latestTag).Trim()

Pop-Location

if (-not $latestTag) {
  Write-Error 'No semver+build tags found.'
  exit 1
}

# strip leading 'APP_V' and validate
$version = $latestTag.TrimStart('AICHORDS_V')
if ($version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+[-+][0-9]+$') {
  Write-Error "Invalid version string: $version"
  exit 1
}

#=== 1) show menu ===#
$menu = @(
  "Build current state"
  "Build + deploy tagged version $version"
  "Quit"
)
$sel = Show-Menu -Title 'Select an option:' -Options $menu
switch ($sel) {
  2 { Write-Host 'Quitting.'; exit 0 }
  1 { $useCurrentCommit = $false; $doDeploy = $true }
  0 { $useCurrentCommit = $true; $doDeploy = $false }
}

#=== 2) determine version ===#
if ($useCurrentCommit) {
  Write-Host "Using current commit with fake version $FAKE_VERSION"
  $version = $FAKE_VERSION
}
else {
  # checkout tagged commit
  Write-Host "Checking out commit $commitHash (detached HEAD)..."
  Push-Location $NATIVE_ROOT

  & git checkout --detach $commitHash | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to checkout commit $commitHash"
    exit 1
  }
  Pop-Location
}


Write-Host ("echo building dBdone backend library...")
& .\build_backend_lib.ps1


Write-Host ("+" * 30)
Write-Host "Building AIChords plugin..."
Write-Host ("+" * 30)


# Write the version header
Write-Host ("Creating version header...")

$VERSION_HEADER_CONTENT = @(
  '#pragma once'
  ''
  "#define SYSTEM_VERSION `"$version`""
)

try {
  $VERSION_HEADER_CONTENT | Set-Content -LiteralPath $VERSION_HEADER_FILE -Encoding UTF8
  Write-Host "Successfully wrote $VERSION_HEADER_FILE with SYSTEM_VERSION = `"$version`"."
}
catch {
  Write-Error "Failed to write $VERSION_HEADER_FILE"
  exit 1
}

Write-Host ("Running Projucer...")
$PROJUCER = "C:\JUCE\JUCE\Projucer.exe"
& $PROJUCER --resave "$NATIVE_ROOT\plugins\aichords\aichords.jucer" 


& .\build_aichords_plugin.ps1

Write-Host ("+" * 30)
Write-Host "Building installer..."
Write-Host ("+" * 30)

Push-Location $INSTALLER_DIR
& .\build_aichords_installer.ps1 $version
Pop-Location

if ($doDeploy) {
  & .\deploy_aichords.ps1 -Version $version
}

Write-Host "Done."