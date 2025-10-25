#!/bin/zsh

setopt NULL_GLOB

BUILD_DATA=./build_data
NATIVE_ROOT=../../native

VST_ROOT_AISOUNDS=./installer/vst_root_aisounds 
VST_DEST_AISOUNDS=$VST_ROOT_AISOUNDS/Library/Audio/Plug-Ins/VST3

rm -rf $VST_ROOT_AISOUNDS/*
mkdir -p $VST_DEST_AISOUNDS

echo BUILDING aisounds VST plugin...

xcodebuild -quiet \
  -project $NATIVE_ROOT/plugins/aisounds/Builds/MacOSX/aisounds.xcodeproj \
  -scheme "aisounds - VST3" \
  -configuration Release \
  -destination "generic/platform=macOS,name=Any Mac" \
  -derivedDataPath build_data \
  clean build

cp -R $NATIVE_ROOT/plugins/aisounds/Builds/MacOSX/build/Release/aisounds.vst3 $VST_DEST_AISOUNDS
