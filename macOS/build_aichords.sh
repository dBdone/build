#!/bin/zsh

setopt NULL_GLOB
set -euo pipefail

BUILD_DATA=./build_data
NATIVE_ROOT=../../native
PRODUCT_RELEASE=$BUILD_DATA/Build/Products/Release/
FAKE_VERSION=9.9.9+99
VERSION_HEADER_FILE=$NATIVE_ROOT/plugins/aichords/Source/version.h
INSTALLER_DIR=./installer
ARCHIVE=./archive

# ───────────────────────────────────────────────────────────────
# Helper: show a 3-item menu and set $sel to 1,2 or 3
# ───────────────────────────────────────────────────────────────
function show_menu() {
  echo
  echo "Select an option:"
  echo "  [1] Build current commit"
  echo "  [2] Build + deploy latest tagged version ($version)"
  echo "  [3] Quit"

  # zsh’s way to prompt inline:
  read "choice?Enter your choice [1-3]: "

  case $choice in
    1) sel=1 ;;
    2) sel=2 ;;
    3) sel=3 ;;
    *)
      echo "Invalid selection."
      return 1
      ;;
  esac
}

# ───────────────────────────────────────────────────────────────
# 1) Fetch and parse the latest semver+build tag
# ───────────────────────────────────────────────────────────────
echo "Fetching git tags…"
pushd .
cd $NATIVE_ROOT
git fetch --tags >/dev/null 2>&1

# collect matching tags into an array
tags=("${(@f)$(git tag --list 'AICHORDS_V[0-9]*.[0-9]*.[0-9]*[-+][0-9]*' --sort=v:refname)}")

if (( ${#tags[@]} == 0 )); then
  echo "No semver+build tags found." >&2
  exit 1
fi

latestTag=${tags[-1]}
commitHash=$(git rev-list -n 1 "$latestTag")
commitMsg=$(git log -1 --format='%s' "$commitHash")

# strip leading 'v'
version=${latestTag#AICHORDS_V}
popd

# sanity-check format
if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+[+-][0-9]+$ ]]; then
  echo "Invalid version string: $version" >&2
  exit 1
fi

# ───────────────────────────────────────────────────────────────
# 2) Show menu and decide what to do
# ───────────────────────────────────────────────────────────────
until show_menu; do :; done

if (( sel == 3 )); then
  echo "Quitting."
  exit 0
elif (( sel == 1 )); then
  useCurrentCommit=true
  doDeploy=false
elif (( sel == 2 )); then
  useCurrentCommit=false
  doDeploy=true
fi


# ───────────────────────────────────────────────────────────────
# 3) Determine version / checkout
# ───────────────────────────────────────────────────────────────
if $useCurrentCommit; then
  echo "Using current commit with fake version $FAKE_VERSION"
  version=$FAKE_VERSION
else

  pushd .
  cd $NATIVE_ROOT

  echo "Checking out commit $commitHash (detached HEAD)…"
  git checkout --detach "$commitHash" >/dev/null 2>&1
  if (( $? != 0 )); then
    echo "Failed to checkout $commitHash" >&2
    exit 1
  fi

  popd
fi

# first step: remove existing AAX plugin (might require admin priviledges):
echo REMOVING existing AAX plugin...
sudo rm -rf /Library/Application\ Support/Avid/Audio/Plug-Ins/aichords.aaxplugin

echo building dBdone backend library...
./build_backend_lib.sh

rm -rf $BUILD_DATA/*

pushd .

echo building plugin...
echo writing version file...

if ! cat > "$VERSION_HEADER_FILE" <<EOF
#pragma once

#define SYSTEM_VERSION "$version"
EOF
then
  echo "Failed to write $VERSION_HEADER_FILE" >&2
  exit 1
fi

echo running Projucer...
PROJUCER="/Users/woolf/JUCE/Projucer.app/Contents/MacOS/Projucer"
$PROJUCER --resave $NATIVE_ROOT/plugins/aichords/aichords.jucer 

./build_aichords_plugin_vst.sh
./build_aichords_plugin_au.sh
./build_aichords_plugin_aax.sh

SOUND_ROOT_AICHORDS=./installer/sound_root_aichords 
SOUND_DEST_AICHORDS="$SOUND_ROOT_AICHORDS/Library/Application Support/com.dbdone.aichords/"

rm -rf $SOUND_ROOT_AICHORDS/*
mkdir -p $SOUND_DEST_AICHORDS

echo copying sound...
cp -R ../common/aichords/sound $SOUND_DEST_AICHORDS

BASIC_ROOT_AICHORDS=./installer/basic_root_aichords 
BASIC_DEST_AICHORDS="$BASIC_ROOT_AICHORDS/Library/Application Support/com.dbdone.aichords/"

rm -rf $BASIC_ROOT_AICHORDS/*
mkdir -p $BASIC_DEST_AICHORDS

echo copying basic...
cp ../../native/components/dbDoneBackend/Lib/dbdone_backend.dylib $BASIC_DEST_AICHORDS



pushd .
cd $INSTALLER_DIR 
./build_aichords_installer.sh $version
popd

if $doDeploy; then
  echo Deploying installer...
  ./deploy_aichords.sh $version
fi

