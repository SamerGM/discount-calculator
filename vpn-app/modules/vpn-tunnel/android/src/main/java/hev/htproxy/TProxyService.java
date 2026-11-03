// JNI binding for hev-socks5-tunnel (https://github.com/heiher/hev-socks5-tunnel, MIT).
// Package/class/method names must match the library's default JNI contract
// (PKGNAME=hev/htproxy, CLSNAME=TProxyService).
package hev.htproxy;

public final class TProxyService {
    public static native boolean TProxyStartService(String configPath, int fd);
    public static native boolean TProxyStopService();
    public static native boolean TProxyIsRunning();
    /** Returns {txPackets, txBytes, rxPackets, rxBytes}. */
    public static native long[] TProxyGetStats();

    static {
        System.loadLibrary("hev-socks5-tunnel");
    }

    private TProxyService() {}
}
