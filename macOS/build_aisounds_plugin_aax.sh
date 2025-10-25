#!/bin/zsh

setopt NULL_GLOB

BUILD_DATA=./build_data
NATIVE_ROOT=../../native
AAX_KEYFILE=../../Orga/aax_cert.p12

AAX_ROOT_AISOUNDS=./installer/aax_root_aisounds 
AAX_DEST_AISOUNDS=$AAX_ROOT_AISOUNDS/Library/Application\ Support/Avid/Audio/Plug-Ins

rm -rf $AAX_ROOT_AISOUNDS/*
mkdir -p $AAX_DEST_AISOUNDS

echo BUILDING aisounds AAX plugin...

xcodebuild -quiet \
  -project $NATIVE_ROOT/plugins/aisounds/Builds/MacOSX/aisounds.xcodeproj \
  -scheme "aisounds - AAX" \
  -configuration Release \
  -destination "generic/platform=macOS,name=Any Mac" \
  -derivedDataPath build_data \
  clean build

echo SIGNING AAX plugin...
/Applications/PACEAntiPiracy/Eden/Fusion/Current/bin/wraptool sign \
  --signid "Developer ID Application: Wolfgang Schneider (3ZW8CQVDYJ)" \
  --verbose --account wschneider@nexoft.de --password _Vorsicht007 \
  --wcguid CFA4C2D0-B51B-11EE-ABFB-00505692AD3E \
  --keyfile $AAX_KEYFILE --keypassword aisounds-1328 \
  --in $NATIVE_ROOT/plugins/aisounds/Builds/MacOSX/build/Release/aisounds.aaxplugin \
  --out $AAX_DEST_AISOUNDS/aisounds.aaxplugin --autoinstall on

