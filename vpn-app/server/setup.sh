#!/usr/bin/env bash
# VPN / proxy server bootstrap for Ubuntu 22.04+/Debian 12+.
#
# Installs any combination of:
#   - WireGuard   (UDP 51820)  -> app mode "WireGuard"
#   - Dante SOCKS5 (TCP+UDP 1080, username/password auth) -> app mode "SOCKS5"
#   - Tinyproxy HTTP (TCP 8888, IP allow-list only)       -> app mode "HTTP"
#
# Usage:
#   sudo ./setup.sh                     # WireGuard + SOCKS5 (default)
#   sudo ./setup.sh --wireguard --socks5 --http
#   sudo HTTP_ALLOW="203.0.113.7/32" ./setup.sh --http
#
# Env overrides: WG_PORT, WG_SUBNET (10.8.0), WG_DNS, SOCKS_PORT, HTTP_PORT,
#                HTTP_ALLOW (space separated CIDRs), PUBLIC_HOST.
set -euo pipefail

WG_PORT="${WG_PORT:-51820}"
WG_SUBNET="${WG_SUBNET:-10.8.0}"         # /24, server = .1
WG_DNS="${WG_DNS:-1.1.1.1, 1.0.0.1}"
SOCKS_PORT="${SOCKS_PORT:-1080}"
HTTP_PORT="${HTTP_PORT:-8888}"
HTTP_ALLOW="${HTTP_ALLOW:-${WG_SUBNET}.0/24}"
STATE_DIR=/etc/vpn-proxy

want_wg=0 want_socks=0 want_http=0
for a in "$@"; do
  case "$a" in
    --wireguard) want_wg=1 ;;
    --socks5) want_socks=1 ;;
    --http) want_http=1 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done
if [ $((want_wg + want_socks + want_http)) -eq 0 ]; then want_wg=1; want_socks=1; fi

[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
. /etc/os-release
case "${ID:-}" in ubuntu|debian) ;; *) echo "warning: tested on Ubuntu/Debian only (found $ID)" >&2 ;; esac

WAN_IF="$(ip -4 route show default | awk '{print $5; exit}')"
[ -n "$WAN_IF" ] || { echo "cannot detect default network interface" >&2; exit 1; }
PUBLIC_HOST="${PUBLIC_HOST:-$(curl -4 -fsS --max-time 5 https://api.ipify.org || ip -4 addr show "$WAN_IF" | awk '/inet /{sub(/\/.*/,"",$2); print $2; exit}')}"

mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
cat > "$STATE_DIR/env" <<ENV
PUBLIC_HOST=$PUBLIC_HOST
WAN_IF=$WAN_IF
WG_PORT=$WG_PORT
WG_SUBNET=$WG_SUBNET
WG_DNS="$WG_DNS"
SOCKS_PORT=$SOCKS_PORT
HTTP_PORT=$HTTP_PORT
ENV

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
pkgs=(curl qrencode iptables)
[ $want_wg -eq 1 ] && pkgs+=(wireguard-tools)
[ $want_socks -eq 1 ] && pkgs+=(dante-server)
[ $want_http -eq 1 ] && pkgs+=(tinyproxy)
apt-get install -y -qq "${pkgs[@]}"

# Kernel tuning: forwarding for WireGuard, BBR for throughput on lossy mobile links.
cat > /etc/sysctl.d/99-vpn-proxy.conf <<SYSCTL
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
SYSCTL
sysctl -q --system || true

open_port() { # proto port
  if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow "$2/$1" >/dev/null; fi
}

# ---------------------------------------------------------------- WireGuard
if [ $want_wg -eq 1 ]; then
  umask 077
  if [ ! -f /etc/wireguard/wg0.conf ]; then
    wg genkey | tee /etc/wireguard/server.key | wg pubkey > /etc/wireguard/server.pub
    cat > /etc/wireguard/wg0.conf <<WG
[Interface]
Address = ${WG_SUBNET}.1/24
ListenPort = ${WG_PORT}
PrivateKey = $(cat /etc/wireguard/server.key)
PostUp = iptables -t nat -A POSTROUTING -s ${WG_SUBNET}.0/24 -o ${WAN_IF} -j MASQUERADE; iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -m state --state RELATED,ESTABLISHED -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -s ${WG_SUBNET}.0/24 -o ${WAN_IF} -j MASQUERADE; iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -m state --state RELATED,ESTABLISHED -j ACCEPT
WG
    echo "[wireguard] created wg0 (${WG_SUBNET}.1/24, udp/${WG_PORT})"
  else
    echo "[wireguard] /etc/wireguard/wg0.conf exists, keeping it"
  fi
  systemctl enable --now wg-quick@wg0 >/dev/null
  open_port udp "$WG_PORT"
fi

# ---------------------------------------------------------------- SOCKS5 (Dante)
if [ $want_socks -eq 1 ]; then
  getent group vpnproxy >/dev/null || groupadd --system vpnproxy
  cat > /etc/danted.conf <<DANTE
logoutput: syslog
internal: 0.0.0.0 port = ${SOCKS_PORT}
external: ${WAN_IF}
clientmethod: none
socksmethod: username
user.privileged: root
user.unprivileged: nobody

client pass { from: 0.0.0.0/0 to: 0.0.0.0/0 log: error }

# Never let proxy users reach the server itself or private networks behind it.
socks block { from: 0.0.0.0/0 to: 127.0.0.0/8 log: connect error }
socks block { from: 0.0.0.0/0 to: 10.0.0.0/8 log: connect error }
socks block { from: 0.0.0.0/0 to: 172.16.0.0/12 log: connect error }
socks block { from: 0.0.0.0/0 to: 192.168.0.0/16 log: connect error }
socks block { from: 0.0.0.0/0 to: 169.254.0.0/16 log: connect error }

socks pass {
  from: 0.0.0.0/0 to: 0.0.0.0/0
  command: connect udpassociate
  group: vpnproxy
  log: error
}
socks pass { from: 0.0.0.0/0 to: 0.0.0.0/0 command: udpreply log: error }
DANTE
  systemctl enable danted >/dev/null
  systemctl restart danted
  open_port tcp "$SOCKS_PORT"; open_port udp "$SOCKS_PORT"
  echo "[socks5] dante listening on tcp/${SOCKS_PORT}; add users with ./add-proxy-user.sh <name>"
fi

# ---------------------------------------------------------------- HTTP (Tinyproxy)
if [ $want_http -eq 1 ]; then
  {
    echo "User tinyproxy"
    echo "Group tinyproxy"
    echo "Port ${HTTP_PORT}"
    echo "Timeout 600"
    echo "MaxClients 200"
    echo "DisableViaHeader Yes"
    echo "LogLevel Warning"
    echo "Syslog On"
    for cidr in $HTTP_ALLOW; do echo "Allow $cidr"; done
    echo "ConnectPort 443"
    echo "ConnectPort 563"
  } > /etc/tinyproxy/tinyproxy.conf
  systemctl enable tinyproxy >/dev/null
  systemctl restart tinyproxy
  open_port tcp "$HTTP_PORT"
  echo "[http] tinyproxy on tcp/${HTTP_PORT}, allowed clients: ${HTTP_ALLOW}"
fi

echo
echo "Server ready. Public host: ${PUBLIC_HOST}"
[ $want_wg -eq 1 ] && echo "  WireGuard client:  sudo ./add-client.sh phone"
[ $want_socks -eq 1 ] && echo "  SOCKS5 user:       sudo ./add-proxy-user.sh alice"
[ $want_http -eq 1 ] && echo "  HTTP proxy URI:    http://${PUBLIC_HOST}:${HTTP_PORT}"
echo "Open these ports in your cloud provider firewall:"
[ $want_wg -eq 1 ] && echo "  udp/${WG_PORT}"
[ $want_socks -eq 1 ] && echo "  tcp/${SOCKS_PORT}, udp/${SOCKS_PORT} and udp/1024-65535 (Dante UDP relay ports)"
[ $want_http -eq 1 ] && echo "  tcp/${HTTP_PORT}"
exit 0
