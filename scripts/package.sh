#!/usr/bin/env sh
# Empaqueta el código fuente (sin node_modules ni dist) en un zip para entregarlo.
set -eu
cd "$(dirname "$0")/.."
version=$(node -p "require('./package.json').version")
out="${1:-youtube-clean-$version-src.zip}"
rm -f "$out"
git ls-files -z | xargs -0 zip -q "$out"
echo "$out"
