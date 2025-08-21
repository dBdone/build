#!/bin/zsh

# Inputs you provide (e.g., as CI secrets)
export KEYCHAIN_NAME="build.keychain-db"
export KEYCHAIN_PW="kc-pass"
export P12_FILE="../../../Orga/devID-certs.p12"              # contains both Developer ID Application + Installer
export P12_PW="dbdone-1328"


# 1) Create + unlock a dedicated keychain
security create-keychain -p "$KEYCHAIN_PW" "$KEYCHAIN_NAME" || true
security set-keychain-settings -lut 7200 "$KEYCHAIN_NAME"   # 2h timeout, no auto-lock mid-build
security unlock-keychain -p "$KEYCHAIN_PW" "$KEYCHAIN_NAME"

# 2) Make it primary in search list (so codesign/productsign find identities)
security list-keychains -d user -s "$KEYCHAIN_NAME" login.keychain-db
security default-keychain -s "$KEYCHAIN_NAME"

# 3) Import your Developer ID .p12 and allow the signing tools to use it non-interactively
security import "$P12_FILE" -k "$KEYCHAIN_NAME" -P "$P12_PW" \
  -T /usr/bin/codesign -T /usr/bin/productsign -T /usr/bin/pkgbuild -A

# 4) (Required on modern macOS) Add the proper partition list so Apple tools can use the key without UI
security set-key-partition-list -S apple-tool:,apple:,codesign: -s \
  -k "$KEYCHAIN_PW" "$KEYCHAIN_NAME"

# 5) Sanity check: should list your Developer ID identities with no prompts
security find-identity -p codesigning "$KEYCHAIN_NAME"

# also for the notarizing step:
xcrun notarytool store-credentials AC_NOTARY \
  --apple-id "wschneider@nexoft.de" \
  --team-id "3ZW8CQVDYJ" \
  --password "ehxb-qwyw-wzck-prog"

  