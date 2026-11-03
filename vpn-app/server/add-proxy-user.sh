#!/usr/bin/env bash
# Creates a SOCKS5 user for Dante (system account, no shell, no home) and prints
# a socks5:// URI + QR to import in the app.
# Usage: sudo ./add-proxy-user.sh <name> [password]
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
NAME="${1:?usage: $0 <name> [password]}"
[[ "$NAME" =~ ^[a-z_][a-z0-9_-]{0,30}$ ]] || { echo "name: lowercase letters, digits, _ or -" >&2; exit 2; }
PASS="${2:-$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)}"
. /etc/vpn-proxy/env
USERNAME="sx_$NAME"

if ! id "$USERNAME" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin -G vpnproxy "$USERNAME"
fi
echo "$USERNAME:$PASS" | chpasswd

enc() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$1"; }
URI="socks5://$(enc "$USERNAME"):$(enc "$PASS")@${PUBLIC_HOST}:${SOCKS_PORT}#$(enc "$NAME@${PUBLIC_HOST}")"
echo "$URI"
qrencode -t ansiutf8 "$URI"
echo "Note: SOCKS5 is not encrypted. Use WireGuard mode on untrusted networks."
