#!/bin/zsh

setopt NULL_GLOB

BUILD_DATA=./build_data
NATIVE_ROOT=../../native

AU_ROOT_DBDONE=./installer/au_root_dbdone 
AU_DEST_DBDONE=$AU_ROOT_DBDONE/Library/Audio/Plug-Ins/Components

rm -rf $AU_ROOT_DBDONE/*
mkdir -p $AU_DEST_DBDONE

echo BUILDING dBdone AU plugin...

xcodebuild -quiet \
  -project $NATIVE_ROOT/plugins/dbdone/Builds/MacOSX/dbdone.xcodeproj \
  -scheme "dbdone - AU" \
  -configuration Release \
  -destination "generic/platform=macOS,name=Any Mac" \
  -derivedDataPath build_data \
  clean build

cp -R $NATIVE_ROOT/plugins/dbdone/Builds/MacOSX/build/Release/dbdone.component $AU_DEST_DBDONE
