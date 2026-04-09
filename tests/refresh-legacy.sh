#!/usr/bin/env bash
set -euo pipefail

# Usage: ./tests/refresh-legacy.sh tests/dicomImageLoaderWADOURI.spec.ts
#        ./tests/refresh-legacy.sh tests/stackLabelmapSegmentation/

if [ $# -eq 0 ]; then
  echo "Usage: $0 <spec-file-or-dir> [spec-file-or-dir ...]"
  echo "Example: $0 tests/dicomImageLoaderWADOURI.spec.ts"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SS_DIR="$ROOT_DIR/tests/screenshots/chromium"

for spec in "$@"; do
  # Normalize: strip leading tests/ or tests/screenshots/chromium/ if given
  spec_name="${spec#tests/}"
  spec_name="${spec_name%/}"

  # Find the matching screenshot directory
  ss_path="$SS_DIR/$spec_name"
  if [ ! -d "$ss_path" ]; then
    echo "No screenshot dir found: $ss_path"
    continue
  fi

  # Delete all screenshots (both legacy and compatibility)
  count=0
  while IFS= read -r -d '' file; do
    rm "$file"
    count=$((count + 1))
  done < <(find "$ss_path" -maxdepth 1 -name '*.png' -print0)

  echo "Deleted $count screenshots from $spec_name"
done

echo ""
echo "Running legacy playwright to regenerate..."
cd "$ROOT_DIR"
# npx playwright test "$@" --project=chromium --update-snapshots

echo ""
echo "Running compatibility (viewport-v2) playwright to regenerate..."
PLAYWRIGHT_FORCE_VIEWPORT_V2="true" npx playwright test "$@" --project=chromium --update-snapshots
