package expo.modules.vpntunnel

import android.os.Bundle
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Process-wide connection state shared by the WireGuard controller, the proxy
 * VpnService and the JS module. Listeners receive a snapshot on every change.
 */
object TunnelState {
  const val DISCONNECTED = "disconnected"
  const val CONNECTING = "connecting"
  const val CONNECTED = "connected"
  const val DISCONNECTING = "disconnecting"
  const val ERROR = "error"

  @Volatile var state: String = DISCONNECTED; private set
  @Volatile var mode: String? = null; private set
  @Volatile var profileId: String? = null; private set
  @Volatile var profileName: String? = null; private set
  @Volatile var error: String? = null; private set
  @Volatile var connectedAt: Long = 0; private set

  private val listeners = CopyOnWriteArraySet<(Bundle) -> Unit>()

  fun addListener(l: (Bundle) -> Unit) { listeners.add(l) }
  fun removeListener(l: (Bundle) -> Unit) { listeners.remove(l) }

  @Synchronized
  fun set(
    newState: String,
    newMode: String? = mode,
    id: String? = profileId,
    name: String? = profileName,
    err: String? = null,
  ) {
    if (newState == CONNECTED && state != CONNECTED) connectedAt = System.currentTimeMillis()
    if (newState != CONNECTED) connectedAt = 0
    state = newState
    mode = newMode
    profileId = id
    profileName = name
    error = err
    val snapshot = toBundle()
    listeners.forEach { runCatching { it(snapshot) } }
  }

  fun isActive(): Boolean = state == CONNECTING || state == CONNECTED

  fun toBundle(): Bundle = Bundle().apply {
    putString("state", state)
    putString("mode", mode)
    putString("profileId", profileId)
    putString("profileName", profileName)
    putString("error", error)
    putDouble("connectedAt", connectedAt.toDouble())
  }
}
