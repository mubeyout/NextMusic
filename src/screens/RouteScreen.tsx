import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, BackHandler, ScrollView, NativeModules, NativeEventSubscription, PanResponder, Dimensions, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPro } from 'react-native-audio-pro';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { toast } from '../components/Dialog';
import { usePlayer } from '../state/PlayerProvider';
import { audioRoute, dlna, googleCast, type LocalDevice, type DlnaDevice, type CastDevice } from '../services/audioroute';
import { loadKnown, rememberKnown, hostPortOf, type KnownDevice } from '../services/devicemem';
const NMBlur = NativeModules.NMBlur as { setBlur: (nativeId: string, enabled: boolean) => void } | undefined;

/**
 * 播放设备选择（2026-08-29 lx31 重做 v3）：
 * - 本机设备：原生 AudioManager 真实枚举（扬声器/有线/USB/蓝牙 A2DP 含设备名），
 *   应用内切换走 DefaultAudioSink.setPreferredDevice，插拔/蓝牙变化实时刷新
 * - DLNA 投屏：SSDP 扫描真实渲染器，点选即把当前流 URL 投给设备（AVTransport SOAP），
 *   投屏中进度/播放态由 PlayerProvider 轮询同步
 * - 音量：真·系统媒体音量（STREAM_MUSIC，含硬件音量键同步）；投屏中变 DLNA 渲染器音量
 * - MiniPlayer 的 devices 按钮 → 全屏透明 Route 页承载本 sheet（不再死按钮）
 */

function VolSlider({ value, onDrag, onCommit }: { value: number; onDrag?: (v: number) => void; onCommit: (v: number) => void }) {
  const wRef = useRef(1);
  const calc = (x: number) => Math.max(0, Math.min(100, Math.round((x / Math.max(1, wRef.current)) * 100)));
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => onDrag?.(calc(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => onDrag?.(calc(e.nativeEvent.locationX)),
      onPanResponderRelease: (e) => onCommit(calc(e.nativeEvent.locationX)),
    }),
  ).current;
  const v = Math.max(0, Math.min(100, value));
  return (
    <View
      style={st.volTrack}
      onLayout={(e) => { wRef.current = e.nativeEvent.layout.width; }}
      {...pan.panHandlers}
    >
      <View style={st.volBase} />
      <View style={[st.volFill, { width: `${v}%` }]} />
      <View style={[st.volThumb, { left: `${v}%` }]} />
    </View>
  );
}

const KIND_META: Record<string, { icon: 'speaker' | 'headphones' | 'devices'; label: string }> = {
  speaker: { icon: 'speaker', label: '扬声器' },
  wired: { icon: 'headphones', label: '有线' },
  usb: { icon: 'headphones', label: 'USB' },
  bluetooth: { icon: 'devices', label: '蓝牙' },
};

export function DeviceSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const playerState = useAudioPro(s => s.playerState);
  const playingLocal = playerState === 'PLAYING';
  const { cast, startCast, stopCast, rebuildAudio } = usePlayer();

  const [devices, setDevices] = useState<LocalDevice[]>([]);
  const [preferred, setPreferred] = useState(-1);
  const [sysVol, setSysVol] = useState(50);
  const [castVol, setCastVol] = useState(50);
  const [renderers, setRenderers] = useState<DlnaDevice[]>([]);
  const [castDevs, setCastDevs] = useState<CastDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [directMode, setDirectMode] = useState(false); // lx42：组播空结果、直连探活注入

  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) Animated.timing(a, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    else a.setValue(0);
  }, [visible, a]);

  // 背景模糊（Android 12+；低版本仅蒙版）；系统返回优先关层
  useEffect(() => {
    if (!visible) return;
    try { NMBlur?.setBlur('playerContent', true); } catch { /* 低版本/未注册 */ }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => {
      try { NMBlur?.setBlur('playerContent', false); } catch { /* ignore */ }
      sub.remove();
    };
  }, [visible, onClose]);

  // 本机设备列表 + 刷新（打开时 + 插拔/蓝牙变化事件）
  const refreshDevices = () => {
    audioRoute.getDevices().then(r => { setDevices(r.devices); setPreferred(r.preferred); }).catch(() => {});
    audioRoute.getVolume().then(setSysVol).catch(() => {});
  };
  useEffect(() => {
    if (!visible) return;
    refreshDevices();
    const sub1 = audioRoute.onDevicesChange(refreshDevices);
    const sub2 = audioRoute.onVolumeChange(setSysVol);
    return () => { sub1?.remove(); sub2?.remove(); };
  }, [visible]);

  // 投屏扫描（DLNA + Chromecast 打开时并行；列表保留到关闭）
  // lx40: App 回前台自动重扫——切网后（如 iNextOS 2.4G 独立网段 → 主 WiFi）旧空列表不再滞留
  useEffect(() => {
    if (!visible) return;
    const clearAll = () => { setRenderers([]); setCastDevs([]); };
    const startAll = () => {
      clearAll(); setScanning(true);
      dlna.startScan(); googleCast.startScan();
    };
    startAll();
    setDirectMode(false);
    const rememberDlna = (dev: DlnaDevice) => {
      const hp = hostPortOf(dev.controlUrl);
      if (hp) rememberKnown([{ kind: 'dlna', uuid: dev.uuid, name: dev.name, host: hp.host, port: hp.port, controlUrl: dev.controlUrl, rcUrl: dev.rcUrl, lastSeen: Date.now() }]);
    };
    const rememberCast = (dev: CastDevice) => {
      if (dev.host && dev.port) rememberKnown([{ kind: 'cast', uuid: dev.uuid, name: dev.name, host: dev.host, port: dev.port, lastSeen: Date.now() }]);
    };
    const subs = [
      dlna.onFound(dev => { rememberDlna(dev); setRenderers(list => (list.some(x => x.uuid === dev.uuid) ? list : [...list, dev])); }),
      dlna.onScanEnd(() => setScanning(false)),
      googleCast.onFound(dev => { rememberCast(dev); setCastDevs(list => (list.some(x => x.uuid === dev.uuid) ? list : [...list, dev])); }),
      googleCast.onScanEnd(() => setScanning(false)),
      AppState.addEventListener('change', s => { if (s === 'active') startAll(); }),
    ];
    return () => { subs.forEach(s => s?.remove()); dlna.stopScan(); googleCast.stopScan(); };
  }, [visible]);

  // lx42 兜底：两路扫描都结束且一无所获（AP/路由器组播抽风）→ 对已知设备 TCP 探活，活的注入列表
  useEffect(() => {
    if (!visible || scanning || renderers.length || castDevs.length) return;
    const known = loadKnown();
    if (!known.length) return;
    let dead = false;
    dlna.probeTcp(known.map(k => ({ host: k.host, port: k.port }))).then(ok => {
      if (dead || !ok.length) return;
      const alive = ok.map(i => known[i]).filter(Boolean) as KnownDevice[];
      const dlnaAlive: DlnaDevice[] = alive
        .filter(k => k.kind === 'dlna' && k.controlUrl)
        .map(k => ({ uuid: k.uuid, name: k.name, controlUrl: k.controlUrl!, rcUrl: k.rcUrl }));
      const castAlive: CastDevice[] = alive
        .filter(k => k.kind === 'cast')
        .map(k => ({ uuid: k.uuid, name: k.name, host: k.host, port: k.port }));
      if (dlnaAlive.length) setRenderers(list => (list.length ? list : dlnaAlive));
      if (castAlive.length) setCastDevs(list => (list.length ? list : castAlive));
      if (dlnaAlive.length || castAlive.length) setDirectMode(true);
    });
    return () => { dead = true; };
  }, [visible, scanning, renderers.length, castDevs.length]);

  // 投屏中：拉取设备当前音量作为初始值
  useEffect(() => {
    if (!visible || !cast) return;
    const api = cast.kind === 'cast' ? googleCast : dlna;
    (cast.kind === 'cast' ? googleCast.getVolume(cast.dev as never) : dlna.getVolume(cast.dev as never))
      .then(setCastVol).catch(() => {});
  }, [visible, cast]);

  if (!visible) return null;

  const pickLocal = (id: number) => {
    audioRoute.selectDevice(id).then(() => {
      setPreferred(id);
      audioRoute.getDevices().then(r => { setDevices(r.devices); setPreferred(r.preferred); }).catch(() => {});
      // lx43：setPreferredDevice 只在 track 重建时生效，无感重启让切换立即生效
      rebuildAudio();
      toast(id < 0 ? '已恢复系统自动选择输出' : '已切换输出设备');
    }).catch(() => toast('此设备暂不支持应用内切换'));
  };

  const setVolCommit = (v: number) => {
    if (cast) {
      setCastVol(v);
      if (cast.kind === 'cast') googleCast.setVolume(cast.dev as never, v).catch(() => toast('Cast 设备不支持音量控制'));
      else dlna.setVolume(cast.dev as never, v).catch(() => toast('设备不支持音量控制'));
    } else { setSysVol(v); audioRoute.setVolume(v).catch(() => {}); }
  };

  // 当前生效的本机设备（无用户偏好时按 系统>蓝牙>有线>USB 优先即系统默认行为）
  const activeId = preferred >= 0 && devices.some(d => d.id === preferred)
    ? preferred
    : (devices.find(d => d.kind === 'bluetooth') ?? devices.find(d => d.kind === 'wired' || d.kind === 'usb') ?? devices.find(d => d.kind === 'speaker') ?? { id: -1 }).id;
  const vol = cast ? castVol : sysVol;
  const sheetY = a.interpolate({ inputRange: [0, 1], outputRange: [420, 0] });

  return (
    <View style={st.overlay} pointerEvents="box-none">
      <Animated.View style={[st.scrim, { opacity: a }]} pointerEvents="auto">
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[st.sheet, { paddingBottom: insets.bottom + 14, transform: [{ translateY: sheetY }] }]}>
        <View style={st.headRow}>
          <View style={st.handle} />
          <TouchableOpacity style={st.closeBtn} onPress={onClose} hitSlop={8}>
            <Icon name="close" size={18} color={C.text2} />
          </TouchableOpacity>
        </View>
        <ScrollView bounces={false} style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 6 }}>
          <Text style={st.title}>选择播放设备</Text>
          <Text style={st.subtitle}>{cast ? `正在${cast.kind === 'cast' ? ' Cast 到' : '投屏到'} ${cast.dev.name}` : '让音乐在附近设备上继续播放'}</Text>

          <Text style={st.label}>本机设备</Text>
          <TouchableOpacity style={[st.deviceRow, activeId === -1 && st.deviceRowOn]} onPress={() => pickLocal(-1)}>
            <View style={[st.iconWrap, activeId === -1 && { backgroundColor: C.brand }]}>
              <Icon name="phone" size={26} color={activeId === -1 ? '#FFFFFF' : C.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.deviceName}>自动（跟随系统）</Text>
              <Text style={activeId === -1 ? st.deviceStatusOn : st.deviceStatus}>
                {devices.filter(d => d.kind !== 'speaker').length
                  ? `已连接 ${devices.filter(d => d.kind !== 'speaker').map(d => d.name).join('、')}`
                  : '未连接外部设备，使用扬声器'}
              </Text>
            </View>
            {activeId === -1 ? <View style={st.checkBadge}><Icon name="check" size={18} color="#FFFFFF" /></View> : null}
          </TouchableOpacity>
          {devices.map(d => {
            // 显式选中才点亮整行（自动模式下本行不算选中，避免与「自动」行双高亮）；生效中只显示状态字
            const on = preferred >= 0 && d.id === preferred;
            const live = activeId === d.id;
            const meta = KIND_META[d.kind] ?? KIND_META.speaker;
            return (
              <TouchableOpacity key={d.id} style={[st.deviceRow, on && st.deviceRowOn]} onPress={() => pickLocal(d.id)}>
                <View style={[st.iconWrap, on && { backgroundColor: C.brand }]}>
                  <Icon name={meta.icon} size={26} color={on ? '#FFFFFF' : C.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.deviceName}>{d.name}</Text>
                  <Text style={on || live ? st.deviceStatusOn : st.deviceStatus}>
                    {meta.label}设备{live && !cast && playingLocal ? ' · 正在播放' : on ? '' : ' · 点击切换'}
                  </Text>
                </View>
                {on ? <View style={st.checkBadge}><Icon name="check" size={18} color="#FFFFFF" /></View> : null}
              </TouchableOpacity>
            );
          })}

          <Text style={st.label}>DLNA 投屏设备</Text>
          {cast?.kind === 'dlna' ? (
            <TouchableOpacity style={[st.deviceRow, st.deviceRowOn]} onPress={() => { stopCast(); toast('已停止投屏，回本机播放'); }}>
              <View style={[st.iconWrap, { backgroundColor: C.brand }]}>
                <Icon name="tv" size={26} color={C.onBrand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.deviceName}>{cast.dev.name}</Text>
                <Text style={st.deviceStatusOn}>正在投屏 · 点击停止并回本机</Text>
              </View>
              <View style={st.checkBadge}><Icon name="check" size={18} color="#FFFFFF" /></View>
            </TouchableOpacity>
          ) : null}
          {renderers.filter(r => cast?.kind !== 'dlna' || r.uuid !== cast.dev.uuid).map(r => (
            <TouchableOpacity key={r.uuid} style={st.deviceRow} onPress={() => { startCast(r, 'dlna'); toast(`正在投屏到 ${r.name}…`); }}>
              <View style={st.iconWrap}><Icon name="tv" size={26} /></View>
              <View style={{ flex: 1 }}>
                <Text style={st.deviceName}>{r.name}</Text>
                <Text style={st.deviceStatus}>DLNA 渲染器 · 点击投屏当前歌曲</Text>
              </View>
              <Icon name="chevronright" size={20} color={C.text3} />
            </TouchableOpacity>
          ))}
          {scanning && renderers.length === 0 ? (
            <Text style={st.scanHint}>正在扫描附近的 DLNA 设备…</Text>
          ) : renderers.length === 0 ? (
            <TouchableOpacity style={st.rescanBtn} onPress={() => { setRenderers([]); setScanning(true); dlna.startScan(); }}>
              <Text style={st.rescanText}>未发现 DLNA 设备（需与手机同一网络）· 重新扫描</Text>
            </TouchableOpacity>
          ) : !cast ? (
            <TouchableOpacity style={st.rescanBtn} onPress={() => { setRenderers([]); setScanning(true); dlna.startScan(); }}>
              <Text style={st.rescanText}>重新扫描</Text>
            </TouchableOpacity>
          ) : null}
          {directMode && renderers.length > 0 ? (
            <Text style={st.scanHint}>网络组播发现受阻，已显示直连可达的已知设备</Text>
          ) : null}

          <Text style={st.label}>Chromecast 设备</Text>
          {cast?.kind === 'cast' ? (
            <TouchableOpacity style={[st.deviceRow, st.deviceRowOn]} onPress={() => { stopCast(); toast('已停止 Cast，回本机播放'); }}>
              <View style={[st.iconWrap, { backgroundColor: C.brand }]}>
                <Icon name="devices" size={26} color={C.onBrand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.deviceName}>{cast.dev.name}</Text>
                <Text style={st.deviceStatusOn}>正在 Cast · 点击停止并回本机</Text>
              </View>
              <View style={st.checkBadge}><Icon name="check" size={18} color="#FFFFFF" /></View>
            </TouchableOpacity>
          ) : null}
          {castDevs.filter(r => cast?.kind !== 'cast' || r.uuid !== cast.dev.uuid).map(r => (
            <TouchableOpacity key={r.uuid} style={st.deviceRow} onPress={() => { startCast(r, 'cast'); toast(`正在 Cast 到 ${r.name}…`); }}>
              <View style={st.iconWrap}><Icon name="devices" size={26} /></View>
              <View style={{ flex: 1 }}>
                <Text style={st.deviceName}>{r.name}</Text>
                <Text style={st.deviceStatus}>Chromecast built-in · 点击推送当前歌曲</Text>
              </View>
              <Icon name="chevronright" size={20} color={C.text3} />
            </TouchableOpacity>
          ))}
          {castDevs.length === 0 && scanning ? (
            <Text style={st.scanHint}>正在扫描 Chromecast 设备…</Text>
          ) : castDevs.length === 0 ? (
            <Text style={st.scanHint}>未发现 Chromecast 设备（国际版音箱/电视/Google TV）</Text>
          ) : null}
        </ScrollView>

        <View style={st.volumeRow}>
          <Icon name="volume" size={22} color={C.text2} />
          <Text style={st.volBtn} onPress={() => setVolCommit(Math.max(0, vol - 10))}>−</Text>
          <VolSlider value={vol} onDrag={(v) => { cast ? setCastVol(v) : (setSysVol(v), audioRoute.setVolume(v).catch(() => {})); }} onCommit={setVolCommit} />
          <Text style={st.volBtn} onPress={() => setVolCommit(Math.min(100, vol + 10))}>＋</Text>
          <Text style={st.volumePct}>{vol}%</Text>
        </View>
        <Text style={st.footer}>{cast ? `音量为${cast.kind === 'cast' ? ' Cast' : '投屏'}设备音量，进度与播放控制与 App 同步` : '音量为系统媒体音量，与音量键一致'}</Text>
      </Animated.View>
    </View>
  );
}

/** 全屏透明承载页：MiniPlayer 的设备按钮 navigate('Route') 到这里 */
export function RoutePage({ navigation }: { navigation: any }) {
  return (
    <View style={st.routePage}>
      <DeviceSheet visible onClose={() => navigation.goBack()} />
    </View>
  );
}

const st = StyleSheet.create({
  routePage: { flex: 1, backgroundColor: 'transparent' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', zIndex: 100, elevation: 100 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.scrim },
  sheet: {
    backgroundColor: C.sheet, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 8,
    // lx35：不用百分比（transparentModal 页测量怪癖），固定 dp 上限；ScrollView flexShrink 收缩
    maxHeight: Math.round(Dimensions.get('window').height * 0.88),
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 28, marginBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.handle },
  closeBtn: { position: 'absolute', right: 0, top: -4, width: 36, height: 36, borderRadius: 18, backgroundColor: C.stroke, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  subtitle: { color: C.text2, fontSize: 12, lineHeight: 16, marginTop: 2 },
  label: { color: C.text2, fontSize: 12, lineHeight: 16, marginTop: 18, marginBottom: 8 },
  deviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64,
    backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 12, marginTop: 6,
  },
  deviceRowOn: { backgroundColor: C.selTint, borderWidth: 1, borderColor: C.brand + '55' },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.inset2, alignItems: 'center', justifyContent: 'center' },
  deviceName: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  deviceStatus: { color: C.text2, fontSize: 11, lineHeight: 15 },
  deviceStatusOn: { color: C.brandText, fontSize: 11, lineHeight: 15 },
  checkBadge: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: C.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  scanHint: { color: C.text3, fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: 'center' },
  rescanBtn: { alignSelf: 'center', marginTop: 10, paddingVertical: 6, paddingHorizontal: 12 },
  rescanText: { color: C.text2, fontSize: 11, lineHeight: 16 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  volBtn: { color: C.text, fontSize: 18, fontWeight: '600', width: 24, textAlign: 'center' },
  volTrack: { flex: 1, height: 28, justifyContent: 'center' },
  volBase: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: C.inset2 },
  volFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: C.brand },
  volThumb: {
    position: 'absolute', top: 6, width: 16, height: 16, borderRadius: 8,
    backgroundColor: C.text, marginLeft: -8,
  },
  volumePct: { color: C.text2, fontSize: 12, width: 36, textAlign: 'right' },
  footer: { color: C.text3, fontSize: 10, lineHeight: 14, marginTop: 10, textAlign: 'center' },
});
