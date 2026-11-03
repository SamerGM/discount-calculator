import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Vpn from './modules/vpn-tunnel';
import type { TunnelMode, TunnelStats, TunnelStatus, WireGuardSummary } from './modules/vpn-tunnel';
import {
  Profile,
  deleteProfile,
  getSelectedId,
  loadProfiles,
  newId,
  parseImport,
  saveProfile,
  setSelectedId,
  validateProfile,
} from './src/profiles';
import { formatAgo, formatBytes, formatDuration } from './src/format';

const C = {
  bg: '#0B1220',
  card: '#131C2E',
  border: '#22304A',
  text: '#E6ECF5',
  dim: '#8A99B4',
  accent: '#3B82F6',
  ok: '#22C55E',
  warn: '#F59E0B',
  err: '#EF4444',
};

const MODE_LABEL: Record<TunnelMode, string> = {
  wireguard: 'WireGuard VPN',
  socks5: 'SOCKS5 (full device)',
  http: 'HTTP proxy (proxy-aware apps)',
};

type Screen = { name: 'home' } | { name: 'edit'; draft: Partial<Profile> } | { name: 'scan'; draft: Partial<Profile> };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<TunnelStatus>(Vpn.getStatus());
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [list, sel] = await Promise.all([loadProfiles(), getSelectedId()]);
    setProfiles(list);
    setSelected(sel && list.some((p) => p.id === sel) ? sel : list[0]?.id ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    const sub = Vpn.addStatusListener(setStatus);
    return () => sub?.remove();
  }, [reload]);

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name === 'home') return false;
      setScreen(screen.name === 'scan' ? { name: 'edit', draft: screen.draft } : { name: 'home' });
      return true;
    });
    return () => h.remove();
  }, [screen]);

  const select = (id: string) => {
    setSelected(id);
    setSelectedId(id);
  };

  if (loading) {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      {screen.name === 'home' && (
        <Home
          profiles={profiles}
          selected={selected}
          status={status}
          onSelect={select}
          onAdd={(type) => setScreen({ name: 'edit', draft: defaultDraft(type) })}
          onEdit={(p) => setScreen({ name: 'edit', draft: { ...p } })}
        />
      )}
      {screen.name === 'edit' && (
        <Editor
          draft={screen.draft}
          isActive={status.profileId === screen.draft.id && (status.state === 'connected' || status.state === 'connecting')}
          onCancel={() => setScreen({ name: 'home' })}
          onScan={(d) => setScreen({ name: 'scan', draft: d })}
          onSaved={async (p) => {
            await saveProfile(p);
            select(p.id);
            await reload();
            setScreen({ name: 'home' });
          }}
          onDelete={async (id) => {
            await deleteProfile(id);
            await reload();
            setScreen({ name: 'home' });
          }}
        />
      )}
      {screen.name === 'scan' && (
        <Scanner
          onCancel={() => setScreen({ name: 'edit', draft: screen.draft })}
          onResult={(data) => {
            const parsed = parseImport(data);
            if (!parsed) {
              Alert.alert('Unsupported QR code', 'Expected a WireGuard config or a socks5:// / http:// URI.');
              setScreen({ name: 'edit', draft: screen.draft });
              return;
            }
            setScreen({ name: 'edit', draft: { ...screen.draft, ...parsed, id: screen.draft.id } });
          }}
        />
      )}
    </View>
  );
}

function defaultDraft(type: TunnelMode): Partial<Profile> {
  if (type === 'wireguard') return { type, name: '', wgConfig: '' };
  return { type, name: '', host: '', port: type === 'socks5' ? 1080 : 8080, udpMode: 'udp', remoteDns: true, dns: '1.1.1.1' };
}

/* ------------------------------- Home ---------------------------------- */

function Home(props: {
  profiles: Profile[];
  selected: string | null;
  status: TunnelStatus;
  onSelect: (id: string) => void;
  onAdd: (t: TunnelMode) => void;
  onEdit: (p: Profile) => void;
}) {
  const { profiles, selected, status } = props;
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<TunnelStats>({});
  const [now, setNow] = useState(Date.now());
  const current = profiles.find((p) => p.id === selected) ?? null;
  const live = status.state === 'connected' || status.state === 'connecting';

  useEffect(() => {
    if (status.state !== 'connected') {
      setStats({});
      return;
    }
    let alive = true;
    const tick = async () => {
      setNow(Date.now());
      const st = await Vpn.getStats().catch(() => ({}));
      if (alive) setStats(st);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [status.state]);

  const toggle = async () => {
    if (!Vpn.isAvailable) {
      Alert.alert('Native build required', 'The VPN engine is not available in Expo Go. Install the APK built by CI or run `npx expo run:android`.');
      return;
    }
    setBusy(true);
    try {
      if (live) {
        await Vpn.disconnect();
      } else {
        if (!current) return;
        const ok = await Vpn.prepare();
        if (!ok) {
          Alert.alert('Permission denied', 'Android VPN permission is required to connect.');
          return;
        }
        await Vpn.connect({ ...current });
      }
    } catch (e: any) {
      Alert.alert('Connection failed', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const color =
    status.state === 'connected' ? C.ok : status.state === 'error' ? C.err : live || busy ? C.warn : C.dim;
  const label =
    status.state === 'connected' ? 'Connected'
    : status.state === 'connecting' ? 'Connecting…'
    : status.state === 'disconnecting' ? 'Disconnecting…'
    : status.state === 'error' ? 'Error'
    : 'Disconnected';

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Text style={s.title}>VPN & Proxy</Text>

      <View style={[s.card, s.center, { paddingVertical: 28 }]}>
        <Pressable
          onPress={toggle}
          disabled={busy || (!live && !current)}
          style={({ pressed }) => [s.power, { borderColor: color, opacity: pressed || busy ? 0.7 : 1 }]}
        >
          {busy || status.state === 'connecting' || status.state === 'disconnecting' ? (
            <ActivityIndicator color={color} size="large" />
          ) : (
            <Text style={[s.powerText, { color }]}>{live ? 'STOP' : 'CONNECT'}</Text>
          )}
        </Pressable>
        <Text style={[s.state, { color }]}>{label}</Text>
        {status.profileName && live ? <Text style={s.dim}>{status.profileName}</Text> : null}
        {status.state === 'error' && status.error ? <Text style={[s.dim, { color: C.err, textAlign: 'center' }]}>{status.error}</Text> : null}

        {status.state === 'connected' && (
          <View style={s.statsRow}>
            <Stat k="Time" v={formatDuration(now - status.connectedAt)} />
            <Stat k="↓ Down" v={formatBytes(stats.rxBytes)} />
            <Stat k="↑ Up" v={formatBytes(stats.txBytes)} />
            {status.mode === 'wireguard' && <Stat k="Handshake" v={formatAgo(stats.lastHandshake, now)} />}
          </View>
        )}
        {status.state === 'connected' && status.mode === 'http' && (
          <Text style={[s.dim, s.small, { textAlign: 'center', marginTop: 8 }]}>
            HTTP mode sets a system proxy; traffic counters are not available.
          </Text>
        )}
      </View>

      <Text style={s.section}>Profiles</Text>
      {profiles.length === 0 && <Text style={s.dim}>No profiles yet. Add one below.</Text>}
      {profiles.map((p) => {
        const isSel = p.id === selected;
        return (
          <Pressable
            key={p.id}
            onPress={() => !live && props.onSelect(p.id)}
            onLongPress={() => props.onEdit(p)}
            style={[s.card, s.row, isSel && { borderColor: C.accent }]}
          >
            <View style={[s.radio, isSel && { backgroundColor: C.accent, borderColor: C.accent }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.text}>{p.name}</Text>
              <Text style={[s.dim, s.small]}>
                {MODE_LABEL[p.type]}
                {p.type !== 'wireguard' ? ` · ${p.host}:${p.port}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => props.onEdit(p)} hitSlop={10}>
              <Text style={{ color: C.accent }}>Edit</Text>
            </Pressable>
          </Pressable>
        );
      })}
      {live && profiles.length > 1 && <Text style={[s.dim, s.small]}>Disconnect to switch profiles.</Text>}

      <View style={[s.row, { gap: 8, marginTop: 8 }]}>
        <Btn label="+ WireGuard" onPress={() => props.onAdd('wireguard')} />
        <Btn label="+ SOCKS5" onPress={() => props.onAdd('socks5')} />
        <Btn label="+ HTTP" onPress={() => props.onAdd('http')} />
      </View>

      {Vpn.isAvailable && (
        <Pressable onPress={() => Vpn.openVpnSettings()} style={{ marginTop: 24 }}>
          <Text style={[s.small, { color: C.accent }]}>
            Kill switch: open Android VPN settings → enable “Block connections without VPN”
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 70 }}>
      <Text style={[s.dim, s.small]}>{k}</Text>
      <Text style={s.text}>{v}</Text>
    </View>
  );
}

/* ------------------------------ Editor --------------------------------- */

function Editor(props: {
  draft: Partial<Profile>;
  isActive: boolean;
  onCancel: () => void;
  onScan: (d: Partial<Profile>) => void;
  onSaved: (p: Profile) => void;
  onDelete: (id: string) => void;
}) {
  const [d, setD] = useState<Partial<Profile>>(props.draft);
  const [wgInfo, setWgInfo] = useState<WireGuardSummary | null>(null);
  const [wgError, setWgError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [importText, setImportText] = useState('');
  const set = (patch: Partial<Profile>) => setD((x) => ({ ...x, ...patch }));
  const type = d.type ?? 'wireguard';

  useEffect(() => setD(props.draft), [props.draft]);

  // Live-validate WireGuard configs with the native parser (same one the tunnel uses).
  useEffect(() => {
    if (type !== 'wireguard' || !d.wgConfig?.trim() || !Vpn.isAvailable) {
      setWgInfo(null);
      setWgError(null);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      Vpn.validateWireGuardConfig(d.wgConfig!)
        .then((info) => alive && (setWgInfo(info), setWgError(null)))
        .catch((e) => alive && (setWgInfo(null), setWgError(e?.message ?? String(e))));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [type, d.wgConfig]);

  const applyImport = () => {
    const parsed = parseImport(importText);
    if (!parsed) {
      Alert.alert('Not recognised', 'Paste a WireGuard config, or socks5://user:pass@host:port, or http://host:port');
      return;
    }
    set({ ...parsed, name: d.name || parsed.name });
    setImportText('');
  };

  const save = () => {
    const p: Profile = {
      id: d.id ?? newId(),
      name: (d.name ?? '').trim(),
      type,
      ...(type === 'wireguard'
        ? { wgConfig: d.wgConfig?.trim() }
        : {
            host: d.host?.trim(),
            port: Number(d.port),
            username: d.username?.trim() || undefined,
            password: d.password || undefined,
            ...(type === 'socks5' ? { udpMode: d.udpMode ?? 'udp', remoteDns: d.remoteDns ?? true, dns: d.dns?.trim() || '1.1.1.1' } : {}),
            bypassApps: (d.bypassApps ?? []).map((x) => x.trim()).filter(Boolean),
          }),
    };
    const err = validateProfile(p) ?? (type === 'wireguard' && wgError ? wgError : null);
    if (err) {
      Alert.alert('Check the profile', err);
      return;
    }
    props.onSaved(p);
  };

  const bypassText = useMemo(() => (d.bypassApps ?? []).join('\n'), [d.bypassApps]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>{d.id ? 'Edit profile' : 'New profile'}</Text>
        <Text style={[s.dim, { marginBottom: 12 }]}>{MODE_LABEL[type]}</Text>
        {props.isActive && (
          <Text style={[s.small, { color: C.warn, marginBottom: 8 }]}>This profile is connected. Changes apply on next connect.</Text>
        )}

        <Field label="Name">
          <TextInput style={s.input} value={d.name} onChangeText={(name) => set({ name })} placeholder="My server" placeholderTextColor={C.dim} />
        </Field>

        <Field label="Import (paste config / URI, or scan QR)">
          <TextInput
            style={[s.input, { minHeight: 44 }]}
            value={importText}
            onChangeText={setImportText}
            placeholder="socks5://user:pass@1.2.3.4:1080"
            placeholderTextColor={C.dim}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={[s.row, { gap: 8, marginTop: 8 }]}>
            <Btn label="Apply" onPress={applyImport} disabled={!importText.trim()} />
            <Btn label="Scan QR" onPress={() => props.onScan(d)} />
          </View>
        </Field>

        {type === 'wireguard' ? (
          <Field label="WireGuard config (wg-quick format)">
            <TextInput
              style={[s.input, s.mono, { minHeight: 180, textAlignVertical: 'top' }]}
              value={d.wgConfig}
              onChangeText={(wgConfig) => set({ wgConfig })}
              placeholder={'[Interface]\nPrivateKey = …\nAddress = 10.8.0.2/32\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = …\nEndpoint = vpn.example.com:51820\nAllowedIPs = 0.0.0.0/0, ::/0'}
              placeholderTextColor={C.dim}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={false}
            />
            {wgError && <Text style={[s.small, { color: C.err, marginTop: 6 }]}>{wgError}</Text>}
            {wgInfo && (
              <Text style={[s.small, { color: C.ok, marginTop: 6 }]}>
                ✓ {wgInfo.addresses.join(', ')} · {wgInfo.peerCount} peer(s) · {wgInfo.endpoints.join(', ') || 'no endpoint'}
                {wgInfo.allowedIps.some((a) => a === '0.0.0.0/0') ? ' · full tunnel' : ' · split tunnel'}
              </Text>
            )}
            <Text style={[s.dim, s.small, { marginTop: 6 }]}>
              Per-app split tunnelling: add IncludedApplications / ExcludedApplications = com.app.id to [Interface].
            </Text>
          </Field>
        ) : (
          <>
            <View style={[s.row, { gap: 8 }]}>
              <Field label="Server host / IP" style={{ flex: 3 }}>
                <TextInput style={s.input} value={d.host} onChangeText={(host) => set({ host })} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="1.2.3.4" placeholderTextColor={C.dim} />
              </Field>
              <Field label="Port" style={{ flex: 1.3 }}>
                <TextInput style={s.input} value={d.port ? String(d.port) : ''} onChangeText={(v) => set({ port: Number(v.replace(/\D/g, '')) || undefined })} keyboardType="number-pad" />
              </Field>
            </View>

            {type === 'socks5' ? (
              <>
                <Field label="Username (optional)">
                  <TextInput style={s.input} value={d.username} onChangeText={(username) => set({ username })} autoCapitalize="none" autoCorrect={false} />
                </Field>
                <Field label="Password (optional)">
                  <View style={s.row}>
                    <TextInput style={[s.input, { flex: 1 }]} value={d.password} onChangeText={(password) => set({ password })} secureTextEntry={!showSecret} autoCapitalize="none" autoCorrect={false} />
                    <Pressable onPress={() => setShowSecret((x) => !x)} style={{ paddingHorizontal: 10 }}>
                      <Text style={{ color: C.accent }}>{showSecret ? 'Hide' : 'Show'}</Text>
                    </Pressable>
                  </View>
                </Field>
                <Toggle
                  label="Remote DNS (resolve through proxy, no DNS leaks)"
                  value={d.remoteDns ?? true}
                  onChange={(remoteDns) => set({ remoteDns })}
                />
                {!(d.remoteDns ?? true) && (
                  <Field label="DNS server (sent over SOCKS5 UDP)">
                    <TextInput style={s.input} value={d.dns} onChangeText={(dns) => set({ dns })} autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                  </Field>
                )}
                <Toggle
                  label="UDP over TCP (only for hev-socks5-server; off = standard UDP ASSOCIATE)"
                  value={d.udpMode === 'tcp'}
                  onChange={(v) => set({ udpMode: v ? 'tcp' : 'udp' })}
                />
              </>
            ) : (
              <Text style={[s.dim, s.small, { marginBottom: 12 }]}>
                Android publishes this as the system HTTP proxy for the VPN network. Browsers and most apps honour it;
                apps that ignore proxy settings connect directly. Proxy authentication is not supported by Android here —
                use IP allow-listing on the server.
              </Text>
            )}

            <Field label="Bypass apps (package names, one per line)">
              <TextInput
                style={[s.input, s.mono, { minHeight: 60, textAlignVertical: 'top' }]}
                value={bypassText}
                onChangeText={(v) => set({ bypassApps: v.split(/\s*[\n,]\s*/) })}
                placeholder="com.example.banking"
                placeholderTextColor={C.dim}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
              />
            </Field>
          </>
        )}

        <View style={[s.row, { gap: 8, marginTop: 16 }]}>
          <Btn label="Save" primary onPress={save} />
          <Btn label="Cancel" onPress={props.onCancel} />
          {d.id ? (
            <Btn
              label="Delete"
              danger
              disabled={props.isActive}
              onPress={() =>
                Alert.alert('Delete profile?', d.name, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => props.onDelete(d.id!) },
                ])
              }
            />
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------ Scanner -------------------------------- */

function Scanner({ onResult, onCancel }: { onResult: (data: string) => void; onCancel: () => void }) {
  const [perm, requestPerm] = useCameraPermissions();
  const done = useRef(false);

  useEffect(() => {
    if (perm && !perm.granted && perm.canAskAgain) requestPerm();
  }, [perm, requestPerm]);

  if (!perm) return <View style={[s.root, s.center]}><ActivityIndicator color={C.accent} /></View>;
  if (!perm.granted) {
    return (
      <View style={[s.root, s.center, { padding: 24 }]}>
        <Text style={[s.text, { textAlign: 'center', marginBottom: 16 }]}>Camera permission is needed to scan QR codes.</Text>
        <View style={[s.row, { gap: 8 }]}>
          <Btn label="Grant" primary onPress={requestPerm} />
          <Btn label="Back" onPress={onCancel} />
        </View>
      </View>
    );
  }
  return (
    <View style={s.root}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (done.current) return;
          done.current = true;
          onResult(data);
        }}
      />
      <View style={[s.page, { paddingBottom: 32 }]}>
        <Text style={[s.dim, { marginBottom: 12 }]}>Point at a WireGuard QR (e.g. from `add-client.sh`) or a socks5:// URI.</Text>
        <Btn label="Cancel" onPress={onCancel} />
      </View>
    </View>
  );
}

/* ------------------------------ UI bits -------------------------------- */

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={[s.dim, s.small, { marginBottom: 4 }]}>{label}</Text>
      {children}
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[s.row, { marginBottom: 12, gap: 12 }]}>
      <Text style={[s.text, { flex: 1, fontSize: 14 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.accent, false: C.border }} />
    </View>
  );
}

function Btn(props: { label: string; onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        s.btn,
        props.primary && { backgroundColor: C.accent, borderColor: C.accent },
        props.danger && { borderColor: C.err },
        (pressed || props.disabled) && { opacity: 0.5 },
      ]}
    >
      <Text style={[s.text, { fontWeight: '600' }, props.danger && { color: C.err }]}>{props.label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  page: { padding: 16, paddingTop: 48 },
  title: { color: C.text, fontSize: 26, fontWeight: '700', marginBottom: 12 },
  section: { color: C.text, fontSize: 18, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  card: { backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { color: C.text, fontSize: 16 },
  dim: { color: C.dim, fontSize: 14 },
  small: { fontSize: 12 },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  power: { width: 150, height: 150, borderRadius: 75, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  powerText: { fontSize: 20, fontWeight: '800', letterSpacing: 1 },
  state: { fontSize: 18, fontWeight: '600', marginTop: 14 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: 16 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.dim, marginRight: 12 },
  input: { backgroundColor: C.bg, borderColor: C.border, borderWidth: 1, borderRadius: 8, color: C.text, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  btn: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
});
