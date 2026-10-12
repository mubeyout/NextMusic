import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { SP, FS } from '../theme/tokens';
import { ProTag } from './ProTag';
import { req } from '../services/server';
import { IS_HD } from '../services/appversion'; // [1012] 弹框居中判定

// [D1 WP2 · MOMO 1012 追加①] 设备管理页——「我的授权→设备列表+解绑」
// 服务端:GET /api/license/devices(byAccount 归属过滤) + DELETE /api/license/devices/<key>/<installId>(归属校验)
// 403 提示「请先在设备管理移除旧设备」的落点即此页——闭环补全

interface DeviceInfo { installId: string; name?: string; at?: number }
interface LicenseInfo { key: string; tier: string; seats?: number; maxDevices: number; devices: DeviceInfo[]; exp?: number; activatedAt?: number; features?: string[] }

interface LicenseDevicesProps {
  visible: boolean;
  onClose: () => void;
}

export function LicenseDevices({ visible, onClose }: LicenseDevicesProps) {
  const insets = useSafeAreaInsets();
  const [lics, setLics] = useState<LicenseInfo[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const data = await req('/api/license/devices') as { ok?: boolean; licenses?: LicenseInfo[]; reason?: string };
      if (data && (data as { ok?: boolean }).ok) setLics(data.licenses || []);
      else { setLics([]); setMsg((data as { reason?: string }).reason || '加载失败'); }
    } catch { setLics([]); setMsg('网络错误'); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => { if (visible && lics == null) void load(true); }, [visible]);

  const unbind = async (key: string, installId: string) => {
    if (busyId) return;
    setBusyId(installId); setMsg(null);
    try {
      const data = await req(`/api/license/devices/${encodeURIComponent(key)}/${encodeURIComponent(installId)}`, { method: 'DELETE' }) as { ok?: boolean; reason?: string };
      if (data && (data as { ok?: boolean }).ok) { setMsg('设备已解绑'); void load(true); }
      else setMsg((data as { reason?: string }).reason || '解绑失败');
    } catch { setMsg('网络错误'); }
    finally { setBusyId(null); }
  };

  if (!visible) return null;

  const totalDevices = (lics || []).reduce((n, l) => n + (l.devices?.length || 0), 0);

  return (
    <View style={[st.overlay, (IS_HD || Platform.OS === 'web') && st.overlayCenter]}>
      <TouchableOpacity style={st.scrim} activeOpacity={1} onPress={onClose} />
      <View style={[st.sheet, { paddingBottom: insets.bottom + SP.lg }]}>
        <View style={st.header}>
          <View style={st.titleRow}>
            <ProTag variant="owned" size="standard" />
            <Text style={st.title}>我的授权 · 设备管理</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Icon name="close" size={20} color={C.text3} />
          </TouchableOpacity>
        </View>

        {lics == null ? (
          <View style={st.center}><ActivityIndicator color={C.brand} /></View>
        ) : lics.length === 0 ? (
          <View style={st.center}>
            <Text style={st.empty}>{msg || '暂无授权——Pro 权益待解锁'}</Text>
            <TouchableOpacity style={st.shopBtn} activeOpacity={0.85}
              onPress={() => { if (typeof window !== 'undefined') window.open('https://nextmusic.mubey.top:8300', '_blank'); }}>
              <Text style={st.shopBtnText}>去店铺购买 Pro ¥19.9</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={{ maxHeight: 420 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={C.brand} />}>
            {lics.map(lic => (
              <View key={lic.key} style={st.licCard}>
                <View style={st.licHead}>
                  <ProTag variant="owned" size="compact" />
                  <Text style={st.licTier}>{lic.tier === 'family' ? '家庭版' : 'Pro'}</Text>
                  <Text style={st.licCount}>{lic.devices?.length || 0}/{lic.maxDevices} 台</Text>
                </View>
                <Text style={st.licKey} numberOfLines={1}>{lic.key}</Text>
                {(lic.devices || []).map(d => (
                  <View key={d.installId} style={st.devRow}>
                    <View style={st.devInfo}>
                      <Text style={st.devName} numberOfLines={1}>{d.name || d.installId.slice(0, 16)}</Text>
                      {d.at ? <Text style={st.devAt}>{new Date(d.at).toLocaleDateString()}</Text> : null}
                    </View>
                    <TouchableOpacity
                      style={[st.unbind, busyId === d.installId && st.unbindOff]}
                      disabled={!!busyId}
                      activeOpacity={0.85}
                      onPress={() => void unbind(lic.key, d.installId)}
                    >
                      {busyId === d.installId
                        ? <ActivityIndicator size="small" color="#E8618C" />
                        : <Text style={st.unbindText}>解绑</Text>}
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))}
            {totalDevices === 0 ? <Text style={st.hint}>此授权码下暂无已登记设备</Text> : null}
          </ScrollView>
        )}

        {msg && (lics || []).length > 0 ? <Text style={st.msg}>{msg}</Text> : null}
        <Text style={st.limit}>每码限 5 台设备 · 解绑后可腾出名额激活新设备</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, justifyContent: 'flex-end', alignItems: 'center' },
  overlayCenter: { justifyContent: 'center' }, // [1012] HD/web 居中模态(老板 ①)
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    width: '100%', maxWidth: 520, backgroundColor: C.card || '#1A1D1B',
    borderRadius: 20,
    padding: SP.xl, gap: SP.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  title: { color: C.text, fontSize: FS.lg, fontWeight: '700' },
  center: { alignItems: 'center', gap: SP.md, paddingVertical: SP.xl },
  empty: { color: C.text2, fontSize: FS.sm },
  shopBtn: { backgroundColor: C.brand, borderRadius: 999, paddingHorizontal: SP.xl, paddingVertical: SP.sm + 2 },
  shopBtnText: { color: '#0B0F0D', fontSize: FS.sm, fontWeight: '700' },
  licCard: { backgroundColor: C.surface2 || '#222523', borderRadius: 14, padding: SP.md, gap: SP.sm, marginBottom: SP.sm },
  licHead: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  licTier: { color: C.text, fontSize: FS.sm, fontWeight: '700', flex: 1 },
  licCount: { color: C.text3, fontSize: FS.xs },
  licKey: { color: C.text3, fontSize: FS.xs, letterSpacing: 0.5 },
  devRow: { flexDirection: 'row', alignItems: 'center', gap: SP.sm, paddingTop: SP.xs, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  devInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  devName: { color: C.text2, fontSize: FS.sm, flexShrink: 1 },
  devAt: { color: C.text3, fontSize: FS.xs },
  unbind: { borderWidth: 1, borderColor: 'rgba(232,97,140,0.45)', borderRadius: 999, paddingHorizontal: SP.md, paddingVertical: 4 },
  unbindOff: { opacity: 0.4 },
  unbindText: { color: '#E8618C', fontSize: FS.xs, fontWeight: '600' },
  hint: { color: C.text3, fontSize: FS.xs, textAlign: 'center', paddingVertical: SP.sm },
  msg: { color: C.brand, fontSize: FS.sm, textAlign: 'center' },
  limit: { color: C.text3, fontSize: FS.xs, textAlign: 'center' },
});
