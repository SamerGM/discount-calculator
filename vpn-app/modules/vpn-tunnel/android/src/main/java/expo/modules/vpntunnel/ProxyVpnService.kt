package expo.modules.vpntunnel

import android.content.Context
import android.content.Intent
import android.net.ProxyInfo
import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.util.Log
import hev.htproxy.TProxyService
import java.io.File
import java.net.Inet6Address
import java.net.InetAddress
import java.util.concurrent.Executors

/**
 * VpnService for the two proxy modes:
 *
 *  - socks5: full-device tunnel. All IPv4/IPv6 traffic enters the TUN and
 *    hev-socks5-tunnel (tun2socks, lwIP) forwards TCP and UDP to the SOCKS5
 *    server. DNS is resolved remotely through the proxy ("mapped DNS"), so it
 *    does not leak to the local network.
 *  - http: system HTTP proxy published on the VPN network
 *    (VpnService.Builder.setHttpProxy). Only proxy-aware apps (browsers, most
 *    HTTP stacks) use it; everything else goes direct. No authentication.
 *
 * This app's own UID is excluded from the VPN so the tunnel engine's sockets to
 * the proxy server do not loop back into the TUN.
 */
class ProxyVpnService : VpnService() {

  companion object {
    private const val TAG = "ProxyVpnService"
    const val ACTION_START = "expo.modules.vpntunnel.START"
    const val ACTION_STOP = "expo.modules.vpntunnel.STOP"

    const val EXTRA_MODE = "mode"
    const val EXTRA_ID = "id"
    const val EXTRA_NAME = "name"
    const val EXTRA_HOST = "host"
    const val EXTRA_PORT = "port"
    const val EXTRA_USER = "username"
    const val EXTRA_PASS = "password"
    const val EXTRA_UDP = "udpMode"
    const val EXTRA_REMOTE_DNS = "remoteDns"
    const val EXTRA_DNS = "dns"
    const val EXTRA_BYPASS = "bypassApps"

    const val MODE_SOCKS5 = "socks5"
    const val MODE_HTTP = "http"

    private const val MTU = 8500
    private const val TUN_V4 = "198.18.0.1"
    private const val TUN_V6 = "fc00::1"
    private const val MAPPED_DNS = "198.18.0.2"

    // HTTP mode only needs an interface; route a tiny unused range so the
    // device's real traffic keeps using the underlying network.
    private const val HTTP_TUN_V4 = "10.111.222.1"
    private const val HTTP_DUMMY_ROUTE = "10.111.222.0"

    @Volatile private var hevRunning = false

    /** True while a proxy-mode session is starting or established. */
    @Volatile var active = false
      private set

    fun stats(): Map<String, Double> {
      if (!hevRunning) return emptyMap()
      val s = runCatching { TProxyService.TProxyGetStats() }.getOrNull() ?: return emptyMap()
      return mapOf("txBytes" to s[1].toDouble(), "rxBytes" to s[3].toDouble())
    }

    fun stop(ctx: Context) {
      ctx.startService(Intent(ctx, ProxyVpnService::class.java).setAction(ACTION_STOP))
    }
  }

  private val worker = Executors.newSingleThreadExecutor()
  private var tun: ParcelFileDescriptor? = null
  private var configFile: File? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_START -> {
        val req = intent
        worker.execute { start(req) }
      }
      ACTION_STOP -> worker.execute { shutdown(stopService = true) }
      else -> {
        // Started by the system without our extras (e.g. Always-on VPN). We
        // don't persist proxy credentials outside the app's secure store, so
        // there is nothing to start; stop cleanly instead of holding a dead TUN.
        worker.execute { shutdown(stopService = true) }
      }
    }
    return START_NOT_STICKY
  }

  private fun start(intent: Intent) {
    shutdown(stopService = false)
    active = true
    val mode = intent.getStringExtra(EXTRA_MODE) ?: MODE_SOCKS5
    val id = intent.getStringExtra(EXTRA_ID)
    val name = intent.getStringExtra(EXTRA_NAME)
    TunnelState.set(TunnelState.CONNECTING, mode, id, name)
    try {
      when (mode) {
        MODE_SOCKS5 -> startSocks(intent)
        MODE_HTTP -> startHttp(intent)
        else -> throw IllegalArgumentException("Unknown mode $mode")
      }
      TunnelState.set(TunnelState.CONNECTED, mode, id, name)
    } catch (e: Exception) {
      Log.e(TAG, "start failed", e)
      shutdown(stopService = false)
      TunnelState.set(TunnelState.ERROR, mode, id, name, e.message ?: e.toString())
      stopSelf()
    }
  }

  private fun baseBuilder(name: String?, bypass: List<String>): Builder {
    val b = Builder()
      .setSession(name ?: "VPN Proxy")
      .setMetered(false)
    b.addDisallowedApplication(packageName)
    bypass.filter { it.isNotBlank() && it != packageName }.forEach {
      runCatching { b.addDisallowedApplication(it.trim()) }
        .onFailure { e -> Log.w(TAG, "bypass app not found: $it", e) }
    }
    return b
  }

  private fun startSocks(intent: Intent) {
    val host = intent.getStringExtra(EXTRA_HOST)?.trim().orEmpty()
    val port = intent.getIntExtra(EXTRA_PORT, 0)
    require(host.isNotEmpty()) { "SOCKS5 host is required" }
    require(port in 1..65535) { "SOCKS5 port is invalid" }
    val user = intent.getStringExtra(EXTRA_USER).orEmpty()
    val pass = intent.getStringExtra(EXTRA_PASS).orEmpty()
    val udpMode = if (intent.getStringExtra(EXTRA_UDP) == "tcp") "tcp" else "udp"
    val remoteDns = intent.getBooleanExtra(EXTRA_REMOTE_DNS, true)
    val dns = intent.getStringExtra(EXTRA_DNS)?.trim().takeUnless { it.isNullOrEmpty() } ?: "1.1.1.1"
    val bypass = intent.getStringArrayListExtra(EXTRA_BYPASS) ?: arrayListOf()

    // hev expects a literal IP. Resolve here: this app is excluded from the
    // VPN, so resolution uses the underlying network.
    val serverIp = InetAddress.getByName(host)
    val serverAddr = serverIp.hostAddress ?: host

    val b = baseBuilder(intent.getStringExtra(EXTRA_NAME), bypass)
      .setMtu(MTU)
      .addAddress(TUN_V4, 32)
      .addRoute("0.0.0.0", 0)
      .addAddress(TUN_V6, 128)
      .addRoute("::", 0)
    if (remoteDns) b.addDnsServer(MAPPED_DNS) else b.addDnsServer(dns)

    val fd = b.establish() ?: throw IllegalStateException("VPN permission not granted")
    tun = fd

    val yaml = buildString {
      appendLine("tunnel:")
      appendLine("  mtu: $MTU")
      appendLine("  ipv4: $TUN_V4")
      appendLine("  ipv6: '$TUN_V6'")
      appendLine("socks5:")
      appendLine("  port: $port")
      appendLine("  address: ${q(if (serverIp is Inet6Address) serverAddr.substringBefore('%') else serverAddr)}")
      appendLine("  udp: '$udpMode'")
      if (user.isNotEmpty()) {
        appendLine("  username: ${q(user)}")
        appendLine("  password: ${q(pass)}")
      }
      if (remoteDns) {
        appendLine("mapdns:")
        appendLine("  address: $MAPPED_DNS")
        appendLine("  port: 53")
        appendLine("  network: 100.64.0.0")
        appendLine("  netmask: 255.192.0.0")
        appendLine("  cache-size: 10000")
      }
      appendLine("misc:")
      appendLine("  task-stack-size: 81920")
      appendLine("  connect-timeout: 10000")
      appendLine("  log-level: warn")
    }
    // App-private storage; deleted on disconnect because it may hold credentials.
    val f = File(noBackupFilesDir, "hev-socks5-tunnel.yml")
    f.writeText(yaml)
    f.setReadable(false, false); f.setReadable(true, true)
    configFile = f

    if (!TProxyService.TProxyStartService(f.absolutePath, fd.fd)) {
      throw IllegalStateException("tun2socks engine failed to start")
    }
    hevRunning = true
  }

  private fun startHttp(intent: Intent) {
    val host = intent.getStringExtra(EXTRA_HOST)?.trim().orEmpty()
    val port = intent.getIntExtra(EXTRA_PORT, 0)
    require(host.isNotEmpty()) { "HTTP proxy host is required" }
    require(port in 1..65535) { "HTTP proxy port is invalid" }
    val bypass = intent.getStringArrayListExtra(EXTRA_BYPASS) ?: arrayListOf()

    val b = baseBuilder(intent.getStringExtra(EXTRA_NAME), bypass)
      .addAddress(HTTP_TUN_V4, 32)
      .addRoute(HTTP_DUMMY_ROUTE, 24)
      .setHttpProxy(ProxyInfo.buildDirectProxy(host, port))
    tun = b.establish() ?: throw IllegalStateException("VPN permission not granted")
  }

  private fun q(s: String): String = "'" + s.replace("'", "''") + "'"

  @Synchronized
  private fun shutdown(stopService: Boolean) {
    val wasActive = hevRunning || tun != null
    if (hevRunning) {
      runCatching { TProxyService.TProxyStopService() }
      hevRunning = false
    }
    runCatching { tun?.close() }
    tun = null
    configFile?.delete()
    configFile = null
    active = false
    if (stopService) {
      if (wasActive && TunnelState.mode != WireGuardController.MODE) {
        TunnelState.set(TunnelState.DISCONNECTED)
      }
      stopSelf()
    }
  }

  override fun onRevoke() {
    // Another VPN took over, or the user disconnected from system settings.
    worker.execute { shutdown(stopService = true) }
  }

  override fun onDestroy() {
    worker.execute { shutdown(stopService = false) }
    worker.shutdown()
    if (TunnelState.mode != WireGuardController.MODE && TunnelState.isActive()) {
      TunnelState.set(TunnelState.DISCONNECTED)
    }
    super.onDestroy()
  }
}
