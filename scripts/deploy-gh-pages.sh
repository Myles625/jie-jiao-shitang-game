#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="${PATH}:${ROOT}/node_modules/.bin"
export BASE_PATH="${BASE_PATH:-/jie-jiao-shitang-game}"
export WRANGLER_LOG_PATH="${WRANGLER_LOG_PATH:-.wrangler/wrangler.log}"

echo "Building static export..."
vinext build
node scripts/prepare-pages.mjs

WORKTREE="$(mktemp -d)"
cleanup() { rm -rf "$WORKTREE"; }
trap cleanup EXIT

git clone --depth 1 --branch gh-pages "https://github.com/Myles625/jie-jiao-shitang-game.git" "$WORKTREE" 2>/dev/null \
  || git clone --depth 1 "https://github.com/Myles625/jie-jiao-shitang-game.git" "$WORKTREE"

cd "$WORKTREE"
git checkout -B gh-pages
find . -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp -R "$ROOT/dist/client/." .
touch .nojekyll
git add -A
if git diff --cached --quiet; then
  echo "No changes to publish."
  exit 0
fi
git commit -m "Publish 蓝宝石餐厅 static site for GitHub Pages"
git push -u origin gh-pages
echo "Published: https://myles625.github.io/jie-jiao-shitang-game/"
