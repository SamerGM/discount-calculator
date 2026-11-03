# VPN Proxy (Android)

An Android VPN and proxy client built with Expo/React Native and a native Kotlin module, plus scripts to set up your own server.

| Mode | Engine | Covers | Encrypted | Notes |
|---|---|---|---|---|
| **WireGuard** | [wireguard-android](https://git.zx2c4.com/wireguard-android) `GoBackend` 1.0.20260102 | Whole device (or split via `AllowedIPs` / `Included/ExcludedApplications`) | Yes (ChaCha20-Poly1305) | Best choice. Lowest latency and handles roaming. DPI can detect and block it. |
| **SOCKS5** | [hev-socks5-tunnel](https://github.com/heiher/hev-socks5-tunnel) 2.19.3 (tun2socks, lwIP) | Whole device, TCP + UDP, IPv4 + IPv6 | **No** (SOCKS5 is plaintext) | Remote DNS (mapped DNS) prevents DNS leaks. UDP needs a server that supports UDP ASSOCIATE (Dante does). |
| **HTTP** | `VpnService.Builder.setHttpProxy` | Only proxy-aware apps (browsers, most HTTP stacks) | Only HTTPS inside CONNECT | Android cannot send proxy credentials here, so lock the server down with an IP allow-list. |

Requires **Android 10+** (minSdk 29). Targets SDK 36.

## Layout

```
vpn-app/
├── App.tsx                       UI: connect button, profiles, editor, QR scanner
├── src/profiles.ts               Profile storage (SecureStore) + import parser
├── modules/vpn-tunnel/           Local Expo native module (Kotlin)
│   ├── index.ts                  JS API: prepare/connect/disconnect/getStatus/getStats
│   └── android/
│       ├── build.gradle          WireGuard AAR + ndk-build of hev-socks5-tunnel
│       └── src/main/java/expo/modules/vpntunnel/
│           ├── VpnTunnelModule.kt     JS bridge, VPN consent, mode switching
│           ├── WireGuardController.kt WireGuard up/down/stats
│           ├── ProxyVpnService.kt     SOCKS5 (tun2socks) + HTTP proxy VpnService
│           └── TunnelState.kt         Shared state and events
├── scripts/fetch-hev.sh          Fetches pinned hev sources (runs on npm install)
└── server/                       VPS setup scripts
```

## Build

You can't use Expo Go because the app needs native code.

**CI (easiest):** every push that touches `vpn-app/**` runs `.github/workflows/vpn-app.yml`. Download the `vpn-proxy-release-apk` artifact from the run and sideload it. If you set the `ANDROID_KEYSTORE_*` secrets, the APK is signed with your key. Otherwise it is signed with the debug key.

**Local** (needs Android Studio, SDK 36 and an NDK):

```bash
cd vpn-app
npm install            # also fetches hev-socks5-tunnel into modules/vpn-tunnel/android/third-party
npx expo run:android   # dev build on a device or emulator
# or: npx expo prebuild -p android --clean && cd android && ./gradlew assembleRelease
```

## Server setup (Ubuntu 22.04/24.04, Debian 12)

```bash
scp -r vpn-app/server root@VPS:/root/vpn-server && ssh root@VPS
cd /root/vpn-server
./setup.sh                          # WireGuard + SOCKS5 (default)
./setup.sh --wireguard --socks5 --http   # everything
HTTP_ALLOW="203.0.113.7/32" ./setup.sh --http

./add-client.sh phone               # WireGuard peer: prints config + QR
./add-proxy-user.sh alice           # SOCKS5 user: prints socks5:// URI + QR
./remove-client.sh wg phone | ./remove-client.sh socks alice
```

Open these ports in your cloud firewall: `udp/51820` (WireGuard), `tcp+udp/1080` plus the UDP relay range (SOCKS5), and `tcp/8888` (HTTP).

`setup.sh` also turns on IP forwarding with NAT for WireGuard and BBR congestion control. It configures Dante to block proxy access to loopback and private ranges, which stops users from reaching the server's internal network.

## Using the app

1. Tap **+ WireGuard / + SOCKS5 / + HTTP**.
2. Paste a config or URI, or tap **Scan QR** and scan the QR from `add-client.sh` or `add-proxy-user.sh`.
   * WireGuard configs are checked live with the same native parser the tunnel uses.
   * URI formats: `socks5://user:pass@host:port#name` and `http://host:port`.
3. Select the profile, tap **CONNECT** and accept the Android VPN prompt (asked once).
4. **Kill switch:** tap the link at the bottom to open Android VPN settings, then turn on *Always-on VPN* and *Block connections without VPN*.

## Security and design notes

* **Secrets:** profiles (WireGuard private keys, proxy passwords) are stored in `expo-secure-store`, which is backed by the Android Keystore. `allowBackup` is off.
* **Temporary file:** in SOCKS5 mode the tun2socks YAML is written to `noBackupFilesDir` and deleted on disconnect.
* **Own app excluded:** this app is left out of the VPN in proxy modes. The tun2socks engine's connections to the proxy server would otherwise loop back into the TUN.
* **SOCKS5 is not encrypted.** Your ISP or network can see your traffic to the proxy and any plaintext inside it. On untrusted networks, use WireGuard.

## Known limitations (v0.1)

* **Always-on VPN:** if Android starts the app on boot, it does not reconnect on its own. Open the app and tap Connect once.
* **HTTP mode:** no traffic counters and no proxy authentication.
* **Platforms:** Android only.
