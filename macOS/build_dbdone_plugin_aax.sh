#!/bin/zsh

setopt NULL_GLOB

BUILD_DATA=./build_data
NATIVE_ROOT=../../native
AAX_KEYFILE=../../Orga/aax_cert.p12

AAX_ROOT_DBDONE=./installer/aax_root_dbdone 
AAX_DEST_DBDONE=$AAX_ROOT_DBDONE/Library/Application\ Support/Avid/Audio/Plug-Ins

rm -rf $AAX_ROOT_DBDONE/*
mkdir -p $AAX_DEST_DBDONE

echo BUILDING dBdone AAX plugin...

xcodebuild -quiet \
  -project $NATIVE_ROOT/plugins/dbdone/Builds/MacOSX/dbdone.xcodeproj \
  -scheme "dbdone - AAX" \
  -configuration Release \
  -destination "generic/platform=macOS,name=Any Mac" \
  -derivedDataPath build_data \
  clean build

echo SIGNING AAX plugin...
/Applications/PACEAntiPiracy/Eden/Fusion/Current/bin/wraptool sign \
  --signid "Developer ID Application: Wolfgang Schneider (3ZW8CQVDYJ)" \
  --verbose --account wschneider@nexoft.de --password _Vorsicht007 \
  --wcguid CFA4C2D0-B51B-11EE-ABFB-00505692AD3E \
  --keyfile $AAX_KEYFILE --keypassword dbdone-1328 \
  --in $NATIVE_ROOT/plugins/dbdone/Builds/MacOSX/build/Release/dbdone.aaxplugin \
  --out $AAX_DEST_DBDONE/dbdone.aaxplugin --autoinstall on

