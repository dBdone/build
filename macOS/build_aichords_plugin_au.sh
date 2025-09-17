#!/bin/zsh

setopt NULL_GLOB

BUILD_DATA=./build_data
NATIVE_ROOT=../../native

AU_ROOT_AICHORDS=./installer/au_root_aichords 
AU_DEST_AICHORDS=$AU_ROOT_AICHORDS/Library/Audio/Plug-Ins/Components

rm -rf $AU_ROOT_AICHORDS/*
mkdir -p $AU_DEST_AICHORDS

echo BUILDING aichords AU plugin...

xcodebuild -quiet \
  -project $NATIVE_ROOT/plugins/aichords/Builds/MacOSX/aichords.xcodeproj \
  -scheme "aichords - AU" \
  -configuration Release \
  -destination "generic/platform=macOS,name=Any Mac" \
  -derivedDataPath build_data \
  clean build

cp -R $NATIVE_ROOT/plugins/aichords/Builds/MacOSX/build/Release/aichords.component $AU_DEST_AICHORDS
