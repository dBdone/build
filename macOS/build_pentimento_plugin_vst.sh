#!/bin/zsh

setopt NULL_GLOB

BUILD_DATA=./build_data
NATIVE_ROOT=../../native

VST_ROOT_PENTIMENTO=./installer/vst_root_pentimento 
VST_DEST_PENTIMENTO=$VST_ROOT_PENTIMENTO/Library/Audio/Plug-Ins/VST3

rm -rf $VST_ROOT_PENTIMENTO/*
mkdir -p $VST_DEST_PENTIMENTO

echo BUILDING pentimento VST plugin...

xcodebuild -quiet \
  -project $NATIVE_ROOT/plugins/pentimento/Builds/MacOSX/pentimento.xcodeproj \
  -scheme "pentimento - VST3" \
  -configuration Release \
  -destination "generic/platform=macOS,name=Any Mac" \
  -derivedDataPath build_data \
  clean build

cp -R $NATIVE_ROOT/plugins/pentimento/Builds/MacOSX/build/Release/pentimento.vst3 $VST_DEST_PENTIMENTO
