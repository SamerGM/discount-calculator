import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TunnelMode } from '../modules/vpn-tunnel';

export interface Profile {
  id: string;
  name: string;
  type: TunnelMode;
  /** wireguard: full wg-quick config text */
  wgConfig?: string;
  /** socks5 / http */
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  udpMode?: 'udp' | 'tcp';
  remoteDns?: boolean;
  dns?: string;
  /** Android package names that bypass the tunnel (proxy modes) */
  bypassApps?: string[];
}

// Profiles hold private keys / passwords, so they live in the Android Keystore-backed
// SecureStore. Only the non-secret selection id goes to AsyncStorage.
const INDEX_KEY = 'profiles_index';
const itemKey = (id: string) => `profile_${id}`;
const SELECTED_KEY = 'selected_profile';

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

async function readIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY);
  try {
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export async function loadProfiles(): Promise<Profile[]> {
  const ids = await readIndex();
  const out: Profile[] = [];
  for (const id of ids) {
    const raw = await SecureStore.getItemAsync(itemKey(id));
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // skip corrupted entry
    }
  }
  return out;
}

export async function saveProfile(p: Profile): Promise<void> {
  await SecureStore.setItemAsync(itemKey(p.id), JSON.stringify(p));
  const ids = await readIndex();
  if (!ids.includes(p.id)) {
    ids.push(p.id);
    await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(ids));
  }
}

export async function deleteProfile(id: string): Promise<void> {
  await SecureStore.deleteItemAsync(itemKey(id));
  const ids = (await readIndex()).filter((x) => x !== id);
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(ids));
}

export const getSelectedId = () => AsyncStorage.getItem(SELECTED_KEY);
export const setSelectedId = (id: string | null) =>
  id ? AsyncStorage.setItem(SELECTED_KEY, id) : AsyncStorage.removeItem(SELECTED_KEY);

/**
 * Parses text pasted or scanned from a QR code into a profile draft:
 *  - wg-quick config ("[Interface] ... [Peer] ...")
 *  - socks5://[user:pass@]host:port[#name]   (also socks://, socks5h://)
 *  - http://[user:pass@]host:port[#name]
 */
export function parseImport(text: string): Partial<Profile> | null {
  const t = text.trim();
  if (/^\s*\[Interface\]/im.test(t) && /\[Peer\]/i.test(t)) {
    return { type: 'wireguard', wgConfig: t, name: 'WireGuard' };
  }
  const m = t.match(/^(socks5h?|socks|https?):\/\/(?:([^:@/]*)(?::([^@/]*))?@)?(\[[^\]]+\]|[^:/#]+):(\d+)\/?(?:#(.*))?$/i);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  const host = m[4].replace(/^\[|\]$/g, '');
  const dec = (s?: string) => (s ? decodeURIComponent(s) : undefined);
  const type: TunnelMode = scheme.startsWith('socks') ? 'socks5' : 'http';
  return {
    type,
    host,
    port: Number(m[5]),
    username: dec(m[2]),
    password: dec(m[3]),
    name: dec(m[6]) || `${type === 'socks5' ? 'SOCKS5' : 'HTTP'} ${host}`,
    udpMode: 'udp',
    remoteDns: true,
  };
}

export function validateProfile(p: Partial<Profile>): string | null {
  if (!p.name?.trim()) return 'Name is required';
  if (p.type === 'wireguard') {
    if (!p.wgConfig?.trim()) return 'Paste or scan a WireGuard config';
    return null;
  }
  if (!p.host?.trim()) return 'Server host is required';
  if (!p.port || !Number.isInteger(p.port) || p.port < 1 || p.port > 65535) return 'Port must be 1–65535';
  if (p.password && !p.username) return 'Username is required when a password is set';
  return null;
}
