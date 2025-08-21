$MSBUILD = "C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe"
$NATIVE_ROOT = "..\..\native"
$BUILD_FOLDER = "$NATIVE_ROOT\components\dbDoneBackend\Builds\VisualStudio2022"


Push-Location $BUILD_FOLDER
try {
  & "$MSBUILD" 'dbDoneBackend.sln' '/p:Configuration=Release' '/t:Clean' '/v:m'
  if ($LASTEXITCODE -ne 0) { throw "MSBuild clean failed (code $LASTEXITCODE)" }

  & "$MSBUILD" 'dbDoneBackend.sln' '/p:Configuration=Release' '/p:Platform=x64' '/v:m'
  if ($LASTEXITCODE -ne 0) { throw "MSBuild build failed (code $LASTEXITCODE)" }
  Write-Host 'backend lib build completed successfully.'
  Pop-Location
}
catch {
  Write-Error $_
  Pop-Location
  exit 1
}
