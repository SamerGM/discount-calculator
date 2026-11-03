import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

export type TunnelMode = 'wireguard' | 'socks5' | 'http';
export type TunnelStateName = 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error';

export interface TunnelStatus {
  state: TunnelStateName;
  mode: TunnelMode | null;
  profileId: string | null;
  profileName: string | null;
  error: string | null;
  /** epoch ms, 0 when not connected */
  connectedAt: number;
}

export interface TunnelStats {
  rxBytes?: number;
  txBytes?: number;
  /** WireGuard only: epoch ms of the most recent peer handshake (0 = none yet) */
  lastHandshake?: number;
}

export interface WireGuardSummary {
  addresses: string[];
  dns: string[];
  peerCount: number;
  endpoints: string[];
  allowedIps: string[];
}

export interface ConnectOptions {
  id: string;
  name: string;
  type: TunnelMode;
  wgConfig?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  udpMode?: 'udp' | 'tcp';
  remoteDns?: boolean;
  dns?: string;
  bypassApps?: string[];
}

type Events = { onStatusChange: (status: TunnelStatus) => void };

declare class VpnTunnelNative extends NativeModule<Events> {
  prepare(): Promise<boolean>;
  connect(options: ConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): TunnelStatus;
  getStats(): Promise<TunnelStats>;
  validateWireGuardConfig(text: string): Promise<WireGuardSummary>;
  openVpnSettings(): void;
}

const native = requireOptionalNativeModule<VpnTunnelNative>('VpnTunnel');

/** False in Expo Go / web: the tunnel needs a development or release build. */
export const isAvailable = native != null;

function mod(): VpnTunnelNative {
  if (!native) {
    throw new Error('VpnTunnel native module not found. Build the app with `npx expo run:android` (Expo Go is not supported).');
  }
  return native;
}

const DISCONNECTED: TunnelStatus = {
  state: 'disconnected', mode: null, profileId: null, profileName: null, error: null, connectedAt: 0,
};

export const prepare = () => mod().prepare();
// Drop undefined fields so they fall back to the native Record defaults.
export const connect = (o: ConnectOptions) => mod().connect(JSON.parse(JSON.stringify(o)));
export const disconnect = () => mod().disconnect();
export const getStatus = (): TunnelStatus => (native ? native.getStatus() : DISCONNECTED);
export const getStats = (): Promise<TunnelStats> => (native ? native.getStats() : Promise.resolve({}));
export const validateWireGuardConfig = (t: string) => mod().validateWireGuardConfig(t);
export const openVpnSettings = () => mod().openVpnSettings();

export function addStatusListener(cb: (s: TunnelStatus) => void): EventSubscription | null {
  return native ? native.addListener('onStatusChange', cb) : null;
}
