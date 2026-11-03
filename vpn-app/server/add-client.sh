#!/usr/bin/env bash
# Adds a WireGuard peer and prints its config as text + QR (scan it in the app).
# Usage: sudo ./add-client.sh <name> [--split]   (--split = only route the VPN subnet)
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
NAME="${1:?usage: $0 <name> [--split]}"
[[ "$NAME" =~ ^[A-Za-z0-9_-]{1,32}$ ]] || { echo "name: letters, digits, _ or - only" >&2; exit 2; }
. /etc/vpn-proxy/env
DIR=/etc/wireguard/clients
mkdir -p "$DIR"; chmod 700 "$DIR"
[ -f "$DIR/$NAME.conf" ] && { echo "client $NAME exists: $DIR/$NAME.conf" >&2; cat "$DIR/$NAME.conf" | qrencode -t ansiutf8; exit 0; }

# Next free host address in the /24.
used="$(grep -ho "${WG_SUBNET}\.[0-9]\+" /etc/wireguard/wg0.conf "$DIR"/*.conf 2>/dev/null | awk -F. '{print $4}' | sort -n | uniq)"
ip=""
for i in $(seq 2 254); do grep -qx "$i" <<<"$used" || { ip="$i"; break; }; done
[ -n "$ip" ] || { echo "subnet full" >&2; exit 1; }

umask 077
priv="$(wg genkey)"; pub="$(echo "$priv" | wg pubkey)"; psk="$(wg genpsk)"
allowed="0.0.0.0/0, ::/0"; [ "${2:-}" = "--split" ] && allowed="${WG_SUBNET}.0/24"

cat >> /etc/wireguard/wg0.conf <<PEER

# client: $NAME
[Peer]
PublicKey = $pub
PresharedKey = $psk
AllowedIPs = ${WG_SUBNET}.${ip}/32
PEER

cat > "$DIR/$NAME.conf" <<CLIENT
[Interface]
PrivateKey = $priv
Address = ${WG_SUBNET}.${ip}/32
DNS = ${WG_DNS}
MTU = 1420

[Peer]
PublicKey = $(cat /etc/wireguard/server.pub)
PresharedKey = $psk
Endpoint = ${PUBLIC_HOST}:${WG_PORT}
AllowedIPs = ${allowed}
PersistentKeepalive = 25
CLIENT

# Apply without dropping existing sessions.
wg syncconf wg0 <(wg-quick strip wg0)

echo "Client config: $DIR/$NAME.conf"
qrencode -t png -o "$DIR/$NAME.png" < "$DIR/$NAME.conf"
qrencode -t ansiutf8 < "$DIR/$NAME.conf"
echo "Scan the QR in the app (Add WireGuard -> Scan QR), or paste the config above."
