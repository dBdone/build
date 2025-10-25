#!/bin/zsh

setopt NULL_GLOB

BUILD_DATA=./build_data
NATIVE_ROOT=../../native

AU_ROOT_AISOUNDS=./installer/au_root_aisounds 
AU_DEST_AISOUNDS=$AU_ROOT_AISOUNDS/Library/Audio/Plug-Ins/Components

rm -rf $AU_ROOT_AISOUNDS/*
mkdir -p $AU_DEST_AISOUNDS

echo BUILDING aisounds AU plugin...

xcodebuild -quiet \
  -project $NATIVE_ROOT/plugins/aisounds/Builds/MacOSX/aisounds.xcodeproj \
  -scheme "aisounds - AU" \
  -configuration Release \
  -destination "generic/platform=macOS,name=Any Mac" \
  -derivedDataPath build_data \
  clean build

cp -R $NATIVE_ROOT/plugins/aisounds/Builds/MacOSX/build/Release/aisounds.component $AU_DEST_AISOUNDS
