#!/bin/zsh

if [ "$#" -eq 1 ]; then
  VERSION=$1
else
  echo "Usage: $0 <version>"
  exit 1
fi


# -- Ensure pandoc is available --
if ! command -v pandoc >/dev/null; then
  echo "Error: pandoc is required (brew install pandoc)." >&2
  exit 1
fi

echo crafting terms-of-service...
pandoc -s -f gfm -t html5 --embed-resources --standalone -o resources/terms-of-service.html ../../terms.md

# for signing:
source ./prepare_signing.sh


OUTPUT_DIR=./output

rm -f $OUTPUT_DIR/*
mkdir -p $OUTPUT_DIR

echo adjusting installer version...

dist_file="distribution_app.xml"

# In‑place edit with BSD sed; -E for extended regex, '' for zero‑length backup suffix
sed -i '' -E \
  "s|(<title>dBdone Version )[0-9]+\.[0-9]+\.[0-9]+[-+][0-9]+(</title>)|\1${VERSION}\2|" \
  "$dist_file"

echo "Patched installer file $dist_file"

pkgbuild --identifier com.dbdone.app.pkg \
    --sign "Developer ID Installer: Wolfgang Schneider (3ZW8CQVDYJ)" \
    --root ./app_root "dBdoneAPP.pkg" 

pkgbuild --identifier com.dbdone.dbdonevst.pkg \
    --sign "Developer ID Installer: Wolfgang Schneider (3ZW8CQVDYJ)" \
    --root ./vst_root_dbdone "dBdoneVST.pkg" 

pkgbuild --identifier com.dbdone.dbdoneau.pkg \
    --sign "Developer ID Installer: Wolfgang Schneider (3ZW8CQVDYJ)" \
    --root ./au_root_dbdone "dBdoneAU.pkg" 

pkgbuild --identifier com.dbdone.dbdoneaax.pkg \
    --sign "Developer ID Installer: Wolfgang Schneider (3ZW8CQVDYJ)" \
    --root ./aax_root_dbdone "dBdoneAAX.pkg" 

productbuild --distribution distribution_app.xml \
  --package-path . --resources resources \
  --sign "Developer ID Installer: Wolfgang Schneider (3ZW8CQVDYJ)"  dBdone\ Installer.pkg

xcrun notarytool submit --wait --keychain-profile AC_NOTARY "dBdone Installer.pkg"

xcrun stapler staple "dBdone Installer.pkg" 
mv "dBdone Installer.pkg" $OUTPUT_DIR

rm dBdoneAPP.pkg
rm dBdoneVST.pkg
rm dBdoneAU.pkg
rm dBdoneAAX.pkg


