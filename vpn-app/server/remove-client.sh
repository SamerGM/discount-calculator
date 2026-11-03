#!/usr/bin/env bash
# Removes a WireGuard client or SOCKS5 user.
# Usage: sudo ./remove-client.sh wg <name> | sudo ./remove-client.sh socks <name>
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
KIND="${1:?usage: $0 wg|socks <name>}"; NAME="${2:?name required}"
case "$KIND" in
  wg)
    f=/etc/wireguard/clients/$NAME.conf
    [ -f "$f" ] || { echo "no such client" >&2; exit 1; }
    pub="$(awk '/^PrivateKey/{print $3}' "$f" | wg pubkey)"
    # Drop the "# client: NAME" block from wg0.conf.
    awk -v n="# client: $NAME" '
      $0==n {skip=1; next}
      skip && /^\[Peer\]/ {next}
      skip && /^(PublicKey|PresharedKey|AllowedIPs)/ {next}
      {skip=0; print}' /etc/wireguard/wg0.conf > /etc/wireguard/wg0.conf.new
    mv /etc/wireguard/wg0.conf.new /etc/wireguard/wg0.conf; chmod 600 /etc/wireguard/wg0.conf
    wg set wg0 peer "$pub" remove || true
    rm -f "$f" "/etc/wireguard/clients/$NAME.png"
    echo "removed WireGuard client $NAME" ;;
  socks)
    userdel "sx_$NAME" && echo "removed SOCKS5 user $NAME" ;;
  *) echo "kind must be wg or socks" >&2; exit 2 ;;
esac
