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

dist_file="distribution_aichords.xml"

# In‑place edit with BSD sed; -E for extended regex, '' for zero‑length backup suffix
sed -i '' -E \
  "s|(<title>AI Chords Version )[0-9]+\.[0-9]+\.[0-9]+[-+][0-9]+(</title>)|\1${VERSION}\2|" \
  "$dist_file"

echo "Patched installer file $dist_file"

pkgbuild --identifier com.dbdone.aichordsbasic.pkg \
    --sign "Developer ID Installer: Wolfgang Schneider (3ZW8CQVDYJ)" \
    --root ./basic_root_aichords "aichordsBASIC.pkg" 

pkgbuild --identifier com.dbdone.aichordssound.pkg \
    --sign "Developer ID Installer: Wolfgang Schneider (3ZW8CQVDYJ)" \
    --root ./sound_root_aichords "aichordsSOUND.pkg" 

pkgbuild --identifier com.dbdone.aichordsvst.pkg \
    --sign "Developer ID Installer: Wolfgang Schneider (3ZW8CQVDYJ)" \
    --root ./vst_root_aichords "aichordsVST.pkg" 

pkgbuild --identifier com.dbdone.aichordsau.pkg \
    --sign "Developer ID Installer: Wolfgang Schneider (3ZW8CQVDYJ)" \
    --root ./au_root_aichords "aichordsAU.pkg" 

pkgbuild --identifier com.dbdone.aichordsaax.pkg \
    --sign "Developer ID Installer: Wolfgang Schneider (3ZW8CQVDYJ)" \
    --root ./aax_root_aichords "aichordsAAX.pkg" 

productbuild --distribution distribution_aichords.xml \
  --package-path . --resources resources \
  --sign "Developer ID Installer: Wolfgang Schneider (3ZW8CQVDYJ)" "AI Chords Installer.pkg"

xcrun notarytool submit --wait --keychain-profile AC_NOTARY "AI Chords Installer.pkg"

xcrun stapler staple "AI Chords Installer.pkg" 
mv "AI Chords Installer.pkg" $OUTPUT_DIR

rm aichordsVST.pkg
rm aichordsAU.pkg
rm aichordsAAX.pkg
rm aichordsSOUND.pkg
rm aichordsBASIC.pkg


