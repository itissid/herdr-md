#!/bin/sh
# Copy the reader and menu from this repo into the running Herdr app. Herdr hot-reloads mods
# on save but doesn't follow a symlinked mod folder, so development uses a copy.
set -e
here=$(cd "$(dirname "$0")/.." && pwd)
for name in herdr-md markdown-menu; do
  dest="${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods/$name"
  mkdir -p "$dest"
  rsync -a --exclude node_modules --exclude .cache --exclude gpui-kit.d.ts "$here/mods/$name/" "$dest/"
  herdr-app check "$dest"
done
