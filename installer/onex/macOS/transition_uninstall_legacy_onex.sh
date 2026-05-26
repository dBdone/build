#!/bin/bash

set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Please run as root (sudo)."
  exit 1
fi

log() {
  /bin/echo "[ONE-X transition] $*"
}

plist_value() {
  local plist_path="$1"
  local key="$2"

  if [[ ! -f "$plist_path" ]]; then
    return 1
  fi

  /usr/libexec/PlistBuddy -c "Print :$key" "$plist_path" 2>/dev/null || return 1
}

remove_if_exists() {
  local target="$1"
  if [[ -e "$target" ]]; then
    /bin/rm -rf "$target"
    log "Removed $target"
  fi
}

standalone_app="/Applications/ONE-X/ONE-X-Standalone.app"
localized_dir="/Applications/ONE-X/ONE-X-Standalone.localized"
vst3_bundle="/Library/Audio/Plug-Ins/VST3/ONE-X.vst3"
au_bundle="/Library/Audio/Plug-Ins/Components/ONE-X.component"
aax_bundle="/Library/Application Support/Avid/Audio/Plug-Ins/ONE-X.aaxplugin"

# Remove legacy standalone app if it still has the old bundle identifier.
standalone_id="$(plist_value "$standalone_app/Contents/Info.plist" "CFBundleIdentifier" || true)"
if [[ "$standalone_id" == "com.dbdone.onex" ]]; then
  remove_if_exists "$standalone_app"
fi

# Remove relocation leftovers if they exist.
remove_if_exists "$localized_dir"

# Remove legacy plugin bundles that still expose default 1.0.0 versioning.
remove_legacy_plugin_if_needed() {
  local bundle_path="$1"
  local info_plist="$bundle_path/Contents/Info.plist"
  local bundle_version
  local short_version

  if [[ ! -f "$info_plist" ]]; then
    return 0
  fi

  bundle_version="$(plist_value "$info_plist" "CFBundleVersion" || true)"
  short_version="$(plist_value "$info_plist" "CFBundleShortVersionString" || true)"

  if [[ "$bundle_version" == 1.0.0* || "$short_version" == 1.0.0* ]]; then
    remove_if_exists "$bundle_path"
  fi
}

remove_legacy_plugin_if_needed "$vst3_bundle"
remove_legacy_plugin_if_needed "$au_bundle"
remove_legacy_plugin_if_needed "$aax_bundle"

log "Transition cleanup finished."
log "Now run the latest ONE-X installer package."

exit 0
