<#
.SYNOPSIS
  Release publisher: login to Supabase, upload installers, insert release row.

.PARAMETER Version
  Release version, e.g. 1.2.3-4
#>

param(
  [Parameter(Mandatory)][string]$Version
)

$SUPABASE_CREDENTIALS_FILE = "..\..\Orga\supabase_credentials.ps1"
$PRODUCT_UID = "9c6f766f-a7ef-47ec-a819-594bec7499ea"

. "$SUPABASE_CREDENTIALS_FILE"

# 2) Upload installer
Write-Host "uploading Windows installer..."

$StorageHeaders = @{
  apikey         = $SECRET_SUPABASE_SERVICE_ROLE_KEY
  Authorization  = "Bearer $SECRET_SUPABASE_SERVICE_ROLE_KEY"
  'x-upsert'     = "true"
  'Content-Type' = 'application/octet-stream'
}

$DBHeadersRead = @{
  apikey           = $SECRET_SUPABASE_SERVICE_ROLE_KEY
  Authorization    = "Bearer $SECRET_SUPABASE_SERVICE_ROLE_KEY"
  'Accept-Profile' = "shop"
  'Content-Type'   = 'application/json'
}

$DBHeadersWrite = @{
  apikey            = $SECRET_SUPABASE_SERVICE_ROLE_KEY
  Authorization     = "Bearer $SECRET_SUPABASE_SERVICE_ROLE_KEY"
  'Content-Profile' = "shop"
  'Content-Type'    = 'application/json'
}

$INSTALLER_FILE = Join-Path -Path $PSScriptRoot\installer\output -ChildPath "dBdone Installer.exe"
$STORAGE_FID = "dBdone-App-$Version.exe"
$REMOTE_INSTALLER_URL = "$PUBLIC_SUPABASE_URL/storage/v1/object/shop/installers/$STORAGE_FID"

Invoke-RestMethod `
  -Method Post `
  -Uri "$REMOTE_INSTALLER_URL" `
  -Headers $StorageHeaders `
  -Body ([IO.File]::ReadAllBytes($INSTALLER_FILE))

Write-Host "upload finished."


# 2) Check if a release with this version_string already exists
$existing = Invoke-RestMethod `
  -Method Get `
  -Uri  "$PUBLIC_SUPABASE_URL/rest/v1/installers?version=eq.$Version" `
  -Headers $DBHeadersRead

if ($existing.Count -eq 0) {
  # 2a) No existing row → insert a new one
  $payload = @{
    version         = $Version
    product_id      = $PRODUCT_UID
    storage_fid_win = $STORAGE_FID
    storage_fid_mac = ''
  } | ConvertTo-Json

  Invoke-RestMethod `
    -Method Post `
    -Uri    "$PUBLIC_SUPABASE_URL/rest/v1/installers" `
    -Headers $DBHeadersWrite `
    -Body    $payload

  Write-Host "Inserted new release row for $Version"
}
else {
  # 2b) Row exists → update only the storage_fid
  $payload = @{
    storage_fid_win = $STORAGE_FID
  } | ConvertTo-Json

  Invoke-RestMethod `
    -Method Patch `
    -Uri    "$PUBLIC_SUPABASE_URL/rest/v1/installers?version=eq.$Version" `
    -Headers $DBHeadersWrite `
    -Body    $payload

  Write-Host "Updated storage_fid for existing release $Version"
}