#!/bin/zsh

setopt NULL_GLOB

BUILD_DATA=./build_data
NATIVE_ROOT=../../native

VST_ROOT_DBDONE=./installer/vst_root_dbdone 
VST_DEST_DBDONE=$VST_ROOT_DBDONE/Library/Audio/Plug-Ins/VST3

rm -rf $VST_ROOT_DBDONE/*
mkdir -p $VST_DEST_DBDONE

echo BUILDING dBdone VST plugin...

xcodebuild -quiet \
  -project $NATIVE_ROOT/plugins/dbdone/Builds/MacOSX/dbdone.xcodeproj \
  -scheme "dbdone - VST3" \
  -configuration Release \
  -destination "generic/platform=macOS,name=Any Mac" \
  -derivedDataPath build_data \
  clean build

cp -R $NATIVE_ROOT/plugins/dbdone/Builds/MacOSX/build/Release/dbdone.vst3 $VST_DEST_DBDONE
