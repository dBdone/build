#!/bin/zsh

setopt NULL_GLOB

BUILD_DATA=./build_data
NATIVE_ROOT=../../native

AU_ROOT_PENTIMENTO=./installer/au_root_pentimento 
AU_DEST_PENTIMENTO=$AU_ROOT_PENTIMENTO/Library/Audio/Plug-Ins/Components

rm -rf $AU_ROOT_PENTIMENTO/*
mkdir -p $AU_DEST_PENTIMENTO

echo BUILDING pentimento AU plugin...

xcodebuild -quiet \
  -project $NATIVE_ROOT/plugins/pentimento/Builds/MacOSX/pentimento.xcodeproj \
  -scheme "pentimento - AU" \
  -configuration Release \
  -destination "generic/platform=macOS,name=Any Mac" \
  -derivedDataPath build_data \
  clean build

cp -R $NATIVE_ROOT/plugins/pentimento/Builds/MacOSX/build/Release/pentimento.component $AU_DEST_PENTIMENTO
