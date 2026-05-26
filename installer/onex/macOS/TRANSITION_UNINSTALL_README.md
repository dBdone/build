# ONE-X transition cleanup (legacy -> current)

Use this only for machines that still have the legacy ONE-X install state.

## What it does

- Removes legacy standalone app if its bundle id is `com.dbdone.onex`.
- Removes `/Applications/ONE-X/ONE-X-Standalone.localized` if present.
- Removes legacy plugin bundles only when they still report `1.0.0*` versions.

## Run

```bash
sudo /bin/bash installer/onex/macOS/transition_uninstall_legacy_onex.sh
```

Then install the latest `ONE-X-*.pkg` normally.

## Notes

- This is a one-time transition helper.
- Do not run this on clean/current installations unless you explicitly want to clear legacy components.
