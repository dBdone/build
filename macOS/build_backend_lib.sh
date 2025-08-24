#!/bin/zsh

setopt NULL_GLOB

echo +++++++++++++++++++++++++++++++
echo building dBdone backend library...
echo +++++++++++++++++++++++++++++++
echo

BUILD_DATA=./build_data
NATIVE_ROOT=../../native

xcodebuild -quiet \
  -project $NATIVE_ROOT/components/dbDoneBackend/Builds/MacOSX/dbDoneBackend.xcodeproj \
  -scheme "dBdoneBackend - Dynamic Library" \
  -configuration Release \
  -destination "generic/platform=macOS" \
  -derivedDataPath build_data \
  clean build

cp $NATIVE_ROOT/components/dbDoneBackend/Builds/MacOSX/build/Release/dbdone_backend.dylib \
  $NATIVE_ROOT/components/dbDoneBackend/Lib

