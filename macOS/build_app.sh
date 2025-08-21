#!/bin/zsh

setopt NULL_GLOB
set -euo pipefail

APP_ROOT=./installer/app_root 
APP_DEST=$APP_ROOT/Applications
SYMBOLS=./symbols
BUILD_DATA=./build_data
NATIVE_ROOT=../../native
PRODUCT_RELEASE=$BUILD_DATA/Build/Products/Release/
PUBSPEC_YAML=pubspec.yaml
FAKE_VERSION=9.9.9+99
VERSION_HEADER_FILE=$NATIVE_ROOT/plugins/dbdone/Source/version.h
INSTALLER_DIR=./installer


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
tags=("${(@f)$(git tag --list 'APP_V[0-9]*.[0-9]*.[0-9]*[-+][0-9]*' --sort=v:refname)}")

if (( ${#tags[@]} == 0 )); then
  echo "No semver+build tags found." >&2
  exit 1
fi

latestTag=${tags[-1]}
commitHash=$(git rev-list -n 1 "$latestTag")
commitMsg=$(git log -1 --format='%s' "$commitHash")

# strip leading 'v'
version=${latestTag#APP_V}
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
sudo rm -rf /Library/Application\ Support/Avid/Audio/Plug-Ins/dbdone.aaxplugin

echo +++++++++++++++++++++++++++++++
echo building app...
echo +++++++++++++++++++++++++++++++
echo

rm -rf $BUILD_DATA/*

pushd .
cd $NATIVE_ROOT/app 

PUBSPEC_VERSION=$(print -r -- "$version" | sed -E 's/^v?([0-9]+\.[0-9]+\.[0-9]+)-([0-9]+)$/\1+\2/')
echo setting app version to $PUBSPEC_VERSION...

sed -i '' -E "s/^(version:[[:space:]]*).*/\1${PUBSPEC_VERSION}/" $PUBSPEC_YAML

echo building Flutter app...
flutter clean 
flutter build macos
popd

rm -rf $APP_ROOT/*
mkdir -p $APP_DEST

echo compiling Flutter app...

xcodebuild archive -quiet -destination "generic/platform=macOS,name=Any Mac" \
  -workspace $NATIVE_ROOT/app/macos/Runner.xcworkspace \
  -scheme Runner -archivePath dbdone.xcarchive

mkdir -p $SYMBOLS
rm -rf $SYMBOLS/*

mv dbdone.xcarchive/dSYMs/* $SYMBOLS

mv dbdone.xcarchive/Products/Applications/* $APP_DEST
rm -rf dbdone.xcarchive

echo building plugins...
echo writing version file...

if ! cat > "$VERSION_HEADER_FILE" <<EOF
#pragma once

#define SYSTEM_VERSION "$version"
EOF
then
  echo "Failed to write $VERSION_HEADER_FILE" >&2
  exit 1
fi

./build_dbdone_plugin_vst.sh
./build_dbdone_plugin_au.sh
./build_dbdone_plugin_aax.sh

pushd .
cd $INSTALLER_DIR 
./build_app_installer.sh $version
popd

echo Deploying installer...
./deploy_app.sh
