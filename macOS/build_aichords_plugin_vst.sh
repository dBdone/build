#!/bin/zsh

setopt NULL_GLOB

BUILD_DATA=./build_data
NATIVE_ROOT=../../native

VST_ROOT_AICHORDS=./installer/vst_root_aichords 
VST_DEST_AICHORDS=$VST_ROOT_AICHORDS/Library/Audio/Plug-Ins/VST3

rm -rf $VST_ROOT_AICHORDS/*
mkdir -p $VST_DEST_AICHORDS

echo BUILDING aichords VST plugin...

xcodebuild -quiet \
  -project $NATIVE_ROOT/plugins/aichords/Builds/MacOSX/aichords.xcodeproj \
  -scheme "aichords - VST3" \
  -configuration Release \
  -destination "generic/platform=macOS,name=Any Mac" \
  -derivedDataPath build_data \
  clean build

cp -R $NATIVE_ROOT/plugins/aichords/Builds/MacOSX/build/Release/aichords.vst3 $VST_DEST_AICHORDS
