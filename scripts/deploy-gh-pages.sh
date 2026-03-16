#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-$ROOT_DIR/../scarfbench-gh-pages}"
DIST_DIR="$ROOT_DIR/dist"

if ! command -v rsync >/dev/null 2>&1; then
  echo "Error: rsync is required but not installed." >&2
  exit 1
fi

if [ ! -d "$TARGET_DIR" ]; then
  echo "Error: target directory does not exist: $TARGET_DIR" >&2
  exit 1
fi

if [ ! -d "$TARGET_DIR/.git" ]; then
  echo "Error: $TARGET_DIR is not a git repository (.git missing)." >&2
  echo "Refusing to deploy to avoid accidental data loss." >&2
  exit 1
fi

echo "Building site..."
cd "$ROOT_DIR"
npm run build

echo "Syncing $DIST_DIR -> $TARGET_DIR (protecting .git)..."
rsync -av --delete --exclude='.git' "$DIST_DIR/" "$TARGET_DIR/"

echo "Done. Next steps:"
echo "  cd $TARGET_DIR"
echo "  git add -A && git commit -m 'Deploy docs' && git push origin gh-pages"
