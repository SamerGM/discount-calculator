#!/usr/bin/env bash
# Fetches hev-socks5-tunnel (tun2socks engine used by SOCKS5 mode) at a pinned
# release, including its submodules. Built by Gradle via ndk-build.
# Runs automatically on `npm install` (postinstall).
set -euo pipefail

HEV_TAG="2.19.3"
HEV_SHA="c5584feca8f6df70ee53eb2879e034b849a3d15a"
HEV_URL="https://github.com/heiher/hev-socks5-tunnel"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/modules/vpn-tunnel/android/third-party/hev-socks5-tunnel"

if [ -f "$DEST/.pinned-sha" ] && [ "$(cat "$DEST/.pinned-sha")" = "$HEV_SHA" ]; then
  echo "[fetch-hev] hev-socks5-tunnel $HEV_TAG already present"
  exit 0
fi

echo "[fetch-hev] fetching hev-socks5-tunnel $HEV_TAG ($HEV_SHA)"
rm -rf "$DEST"
mkdir -p "$DEST"
git -C "$DEST" init -q
git -C "$DEST" remote add origin "$HEV_URL"
git -C "$DEST" fetch -q --depth 1 origin "$HEV_SHA"
git -C "$DEST" checkout -q FETCH_HEAD
git -C "$DEST" submodule update -q --init --recursive
# build.mk embeds the commit id; write it so the build doesn't need git.
git -C "$DEST" rev-parse --short HEAD > "$DEST/.rev-id"
echo "$HEV_SHA" > "$DEST/.pinned-sha"
echo "[fetch-hev] done"
