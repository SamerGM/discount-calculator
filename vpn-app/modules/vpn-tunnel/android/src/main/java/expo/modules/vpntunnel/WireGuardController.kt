package expo.modules.vpntunnel

import android.content.Context
import android.os.Bundle
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.BadConfigException
import com.wireguard.config.Config
import java.io.BufferedReader
import java.io.StringReader

/** Thin wrapper around wireguard-android's userspace (Go) backend. */
object WireGuardController {
  private const val TUNNEL_NAME = "vpnproxy"

  @Volatile private var backend: GoBackend? = null

  private val tunnel = object : Tunnel {
    override fun getName(): String = TUNNEL_NAME
    override fun onStateChange(newState: Tunnel.State) {
      // Backend reports DOWN when the system revokes the VPN (e.g. another VPN app started).
      if (newState == Tunnel.State.DOWN && TunnelState.mode == MODE && TunnelState.isActive()) {
        TunnelState.set(TunnelState.DISCONNECTED)
      }
    }
  }

  const val MODE = "wireguard"

  private fun backend(ctx: Context): GoBackend =
    backend ?: synchronized(this) {
      backend ?: GoBackend(ctx.applicationContext).also { backend = it }
    }

  fun parse(text: String): Config = try {
    Config.parse(BufferedReader(StringReader(text)))
  } catch (e: BadConfigException) {
    throw IllegalArgumentException(
      "Invalid WireGuard config: ${e.section.name.lowercase()} / ${e.location.name.lowercase()} " +
        "(${e.reason.name.lowercase().replace('_', ' ')})" +
        (e.text?.let { ": $it" } ?: ""),
      e,
    )
  }

  /** Summary used by the UI to show what a pasted / scanned config contains. */
  fun describe(text: String): Bundle {
    val cfg = parse(text)
    val iface = cfg.`interface`
    return Bundle().apply {
      putStringArrayList("addresses", ArrayList(iface.addresses.map { it.toString() }))
      putStringArrayList("dns", ArrayList(iface.dnsServers.map { it.hostAddress ?: it.toString() }))
      putInt("peerCount", cfg.peers.size)
      putStringArrayList(
        "endpoints",
        ArrayList(cfg.peers.mapNotNull { p -> p.endpoint.orElse(null)?.toString() }),
      )
      putStringArrayList(
        "allowedIps",
        ArrayList(cfg.peers.flatMap { p -> p.allowedIps.map { it.toString() } }),
      )
    }
  }

  /** Blocking: call off the main thread. */
  fun up(ctx: Context, id: String, name: String, configText: String) {
    val cfg = parse(configText)
    TunnelState.set(TunnelState.CONNECTING, MODE, id, name)
    try {
      backend(ctx).setState(tunnel, Tunnel.State.UP, cfg)
      TunnelState.set(TunnelState.CONNECTED, MODE, id, name)
    } catch (e: Exception) {
      runCatching { backend(ctx).setState(tunnel, Tunnel.State.DOWN, null) }
      TunnelState.set(TunnelState.ERROR, MODE, id, name, e.message ?: e.toString())
      throw e
    }
  }

  /** Blocking: call off the main thread. */
  fun down(ctx: Context) {
    val b = backend ?: return
    if (b.getState(tunnel) == Tunnel.State.UP) {
      TunnelState.set(TunnelState.DISCONNECTING)
      b.setState(tunnel, Tunnel.State.DOWN, null)
    }
    if (TunnelState.mode == MODE) TunnelState.set(TunnelState.DISCONNECTED)
  }

  fun isUp(): Boolean = backend?.getState(tunnel) == Tunnel.State.UP

  fun stats(ctx: Context): Bundle {
    val out = Bundle()
    val b = backend ?: return out
    if (b.getState(tunnel) != Tunnel.State.UP) return out
    val s = b.getStatistics(tunnel)
    out.putDouble("rxBytes", s.totalRx().toDouble())
    out.putDouble("txBytes", s.totalTx().toDouble())
    val latest = s.peers().mapNotNull { s.peer(it)?.latestHandshakeEpochMillis() }.maxOrNull() ?: 0L
    out.putDouble("lastHandshake", latest.toDouble())
    return out
  }
}
