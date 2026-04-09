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

  # Delete only legacy screenshots (not compatibility-viewport-v2-*)
  count=0
  while IFS= read -r -d '' file; do
    rm "$file"
    count=$((count + 1))
  done < <(find "$ss_path" -maxdepth 1 -name '*.png' ! -name 'compatibility-viewport-v2-*' -print0)

  echo "Deleted $count legacy screenshots from $spec_name"
done

echo ""
echo "Running playwright to regenerate..."
./scripts/run-playright.sh all --project=chromium -- "$@" --update-snapshots
