#!/usr/bin/env bash
set -euo pipefail
sha=${1:?usage: vendor.sh <margin-core sha>}
repo=${MARGIN_CORE_REPO:-git@github.com:DamiTesfaye/margin-core.git}
here=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git clone --quiet "$repo" "$tmp/margin-core"
git -C "$tmp/margin-core" checkout --quiet "$sha"
bash "$tmp/margin-core/scripts/build-wasm.sh"
rm -rf "$here/dist/web" "$here/conformance"
mkdir -p "$here/dist/web"
cp "$tmp/margin-core/dist/web/"* "$here/dist/web/"
cp -R "$tmp/margin-core/conformance" "$here/conformance"
size=$(gzip -9c "$here/dist/web/margin_core_wasm_bg.wasm" | wc -c | tr -d ' ')
printf 'sha %s\ngzip %s\n' "$(git -C "$tmp/margin-core" rev-parse HEAD)" "$size" > "$here/VERSION"
cat "$here/VERSION"
