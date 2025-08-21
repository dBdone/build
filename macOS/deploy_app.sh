#!/usr/bin/env zsh
set -euo pipefail

# usage check
if (( $# < 1 )); then
  echo "Usage: $0 <version>"
  exit 1
fi

VERSION=$1
SUPABASE_CREDENTIALS_FILE=../../Orga/supabase_credentials.txt
PRODUCT_UID=9c6f766f-a7ef-47ec-a819-594bec7499ea

# -- Ensure jq is available --
if ! command -v jq >/dev/null; then
  echo "Error: jq is required (brew install jq)." >&2
  exit 1
fi


# get supabase credentials
set -a
source $SUPABASE_CREDENTIALS_FILE
set +a

# -- 1) Upload Mac installer --
# find script dir
INSTALLER_FILE="./installer/output/dBdone Installer.pkg"
STORAGE_FID=dBdone-App-$VERSION.pkg
REMOTE_INSTALLER_URL="$PUBLIC_SUPABASE_URL/storage/v1/object/shop/installers/$STORAGE_FID"

echo "Uploading installer to Supabase Storage..."
curl -s -X POST \
  -H "apikey: $SECRET_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SECRET_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/octet-stream" \
  -H "x-upsert: true" \
  --data-binary @"$INSTALLER_FILE" \
  "$REMOTE_INSTALLER_URL" \
  || { echo "Upload failed"; exit 1; }
echo "Upload finished."

# -- 2) Upsert release row in plugin_versions --
# check existing
existing_json=$(curl -s -X GET \
  -H "apikey: $SECRET_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SECRET_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Accept-Profile: shop" \
  "$PUBLIC_SUPABASE_URL/rest/v1/installers?version=eq.$VERSION")

existing_count=$(echo "$existing_json" | jq 'length')
if (( existing_count == 0 )); then
  echo "Inserting new release row..."
  payload=$(jq -nc \
    --arg vs "$VERSION" \
    --arg pid "$PRODUCT_UID" \
    --arg win "" \
    --arg mac "$STORAGE_FID" \
    '{version:$vs,product_id:$pid,storage_fid_win:$win,storage_fid_mac:$mac}')
  curl -s -X POST \
    -H "apikey: $SECRET_SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SECRET_SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Content-Profile: shop" \
    -d "$payload" \
    "$PUBLIC_SUPABASE_URL/rest/v1/installers" \
    || { echo "✖ Insert failed"; exit 1; }
  echo "Inserted release $VERSION."
else
  echo "Updating download_url of existing row..."
  payload=$(jq -nc --arg mac "$STORAGE_FID" '{storage_fid_mac:$mac}')
  curl -s -X PATCH \
    -H "apikey: $SECRET_SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SECRET_SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Content-Profile: shop" \
    -d "$payload" \
    "$PUBLIC_SUPABASE_URL/rest/v1/installers?version_string=eq.$VERSION" \
    || { echo "Update failed"; exit 1; }
  echo "Updated release $VERSION."
fi


