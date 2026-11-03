package expo.modules.vpntunnel

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class ConnectOptions : Record {
  @Field val id: String = ""
  @Field val name: String = ""
  /** "wireguard" | "socks5" | "http" */
  @Field val type: String = ""
  @Field val wgConfig: String? = null
  @Field val host: String? = null
  @Field val port: Int = 0
  @Field val username: String? = null
  @Field val password: String? = null
  /** SOCKS5 UDP relay: "udp" (standard UDP ASSOCIATE) or "tcp" (UDP-over-TCP, hev servers only). */
  @Field val udpMode: String = "udp"
  @Field val remoteDns: Boolean = true
  @Field val dns: String? = null
  @Field val bypassApps: List<String> = emptyList()
}

class VpnTunnelException(message: String, cause: Throwable? = null) :
  CodedException("ERR_VPN_TUNNEL", message, cause)

class VpnTunnelModule : Module() {
  private companion object {
    const val PREPARE_REQUEST = 0x5650 // "VP"
  }

  private var pendingPrepare: Promise? = null
  private val listener: (Bundle) -> Unit = { sendEvent("onStatusChange", it) }

  private val context: Context
    get() = appContext.reactContext?.applicationContext
      ?: throw VpnTunnelException("React context is not available")

  override fun definition() = ModuleDefinition {
    Name("VpnTunnel")
    Events("onStatusChange")

    OnCreate { TunnelState.addListener(listener) }
    OnDestroy { TunnelState.removeListener(listener) }

    /** Shows the system VPN consent dialog if needed. Resolves true when permission is granted. */
    AsyncFunction("prepare") { promise: Promise ->
      val intent = VpnService.prepare(context)
      if (intent == null) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
        ?: throw VpnTunnelException("No foreground activity to request VPN permission")
      pendingPrepare?.resolve(false)
      pendingPrepare = promise
      activity.startActivityForResult(intent, PREPARE_REQUEST)
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, payload ->
      if (payload.requestCode == PREPARE_REQUEST) {
        pendingPrepare?.resolve(payload.resultCode == Activity.RESULT_OK)
        pendingPrepare = null
      }
    }

    AsyncFunction("connect") { opts: ConnectOptions ->
      if (VpnService.prepare(context) != null) {
        throw VpnTunnelException("VPN permission not granted. Call prepare() first.")
      }
      // Only one VPN can be active per app: tear down whichever mode is running.
      // (Proxy -> proxy restarts are handled inside the service itself.)
      stopAll(keepProxyService = opts.type != WireGuardController.MODE)
      try {
        when (opts.type) {
          WireGuardController.MODE -> {
            val cfg = opts.wgConfig ?: throw VpnTunnelException("WireGuard config is empty")
            WireGuardController.up(context, opts.id, opts.name, cfg)
          }
          ProxyVpnService.MODE_SOCKS5, ProxyVpnService.MODE_HTTP -> {
            val intent = Intent(context, ProxyVpnService::class.java)
              .setAction(ProxyVpnService.ACTION_START)
              .putExtra(ProxyVpnService.EXTRA_MODE, opts.type)
              .putExtra(ProxyVpnService.EXTRA_ID, opts.id)
              .putExtra(ProxyVpnService.EXTRA_NAME, opts.name)
              .putExtra(ProxyVpnService.EXTRA_HOST, opts.host)
              .putExtra(ProxyVpnService.EXTRA_PORT, opts.port)
              .putExtra(ProxyVpnService.EXTRA_USER, opts.username)
              .putExtra(ProxyVpnService.EXTRA_PASS, opts.password)
              .putExtra(ProxyVpnService.EXTRA_UDP, opts.udpMode)
              .putExtra(ProxyVpnService.EXTRA_REMOTE_DNS, opts.remoteDns)
              .putExtra(ProxyVpnService.EXTRA_DNS, opts.dns)
              .putStringArrayListExtra(ProxyVpnService.EXTRA_BYPASS, ArrayList(opts.bypassApps))
            TunnelState.set(TunnelState.CONNECTING, opts.type, opts.id, opts.name)
            context.startService(intent)
          }
          else -> throw VpnTunnelException("Unknown profile type '${opts.type}'")
        }
      } catch (e: CodedException) {
        throw e
      } catch (e: Exception) {
        throw VpnTunnelException(e.message ?: e.toString(), e)
      }
      Unit
    }

    AsyncFunction("disconnect") {
      stopAll()
      Unit
    }

    Function("getStatus") {
      TunnelState.toBundle()
    }

    AsyncFunction("getStats") {
      when (TunnelState.mode) {
        WireGuardController.MODE -> WireGuardController.stats(context)
        else -> Bundle().apply {
          ProxyVpnService.stats().forEach { (k, v) -> putDouble(k, v) }
        }
      }
    }

    /** Parses a wg-quick config with the same parser the tunnel uses; throws with a readable reason. */
    AsyncFunction("validateWireGuardConfig") { text: String ->
      try {
        WireGuardController.describe(text)
      } catch (e: Exception) {
        throw VpnTunnelException(e.message ?: "Invalid WireGuard config", e)
      }
    }

    /** Opens Android VPN settings (Always-on VPN / "Block connections without VPN"). */
    Function("openVpnSettings") {
      val activity = appContext.currentActivity
      val intent = Intent(Settings.ACTION_VPN_SETTINGS)
      if (activity != null) activity.startActivity(intent)
      else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  /** Blocking (runs on the module's background queue). */
  private fun stopAll(keepProxyService: Boolean = false) {
    if (WireGuardController.isUp()) WireGuardController.down(context)
    if (ProxyVpnService.active && !keepProxyService) {
      TunnelState.set(TunnelState.DISCONNECTING)
      ProxyVpnService.stop(context)
      // Wait (bounded) for the service to release the TUN before a new VPN is established.
      val deadline = System.currentTimeMillis() + 3000
      while (ProxyVpnService.active && System.currentTimeMillis() < deadline) Thread.sleep(50)
    } else if (!ProxyVpnService.active && !WireGuardController.isUp() &&
      TunnelState.state != TunnelState.DISCONNECTED && !keepProxyService
    ) {
      // Clear a stale error state.
      TunnelState.set(TunnelState.DISCONNECTED)
    }
  }
}
