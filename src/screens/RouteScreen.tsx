import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, BackHandler, Linking, NativeModules } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AudioPro, useAudioPro } from 'react-native-audio-pro';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
const NMBlur = NativeModules.NMBlur as { setBlur: (nativeId: string, enabled: boolean) => void } | undefined;

// 播放设备选择（2026-08-29 重做）：
// - 悬浮在播放页之上（不再全屏覆盖整个 App / 不再用 RN Modal——规避 tap 死焦点设备怪癖）
// - 背景蒙版：Android 12+ 真背景模糊（NMBlur RenderEffect），低版本降级半透明蒙版
// - 右上角关闭按钮可点；选择设备后自动收起；系统返回优先关闭本层
// 说明：RN 层无法枚举蓝牙设备（需原生模块），蓝牙/外部音响切换引导到系统蓝牙设置完成。
export function DeviceSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const volume = useAudioPro(s => s.volume);
  const playerState = useAudioPro(s => s.playerState);
  const [vol, setVol] = useState<number>(Math.round((volume ?? 1) * 100));
  const [speaker, setSpeaker] = useState(true); // 本机扬声器输出
  const playing = playerState === 'PLAYING';

  // 入场动画：蒙版淡入 + sheet 上滑
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) Animated.parallel([
      Animated.timing(a, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    else a.setValue(0);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // 背景模糊（Android 12+；低版本无操作仅蒙版）；系统返回优先关层
  useEffect(() => {
    if (!visible) return;
    try { NMBlur?.setBlur('playerContent', true); } catch { /* 低版本/未注册 */ }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => {
      try { NMBlur?.setBlur('playerContent', false); } catch { /* ignore */ }
      sub.remove();
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  const applyVol = (v: number) => {
    setVol(v);
    AudioPro.setVolume(v / 100);
  };

  const sheetY = a.interpolate({ inputRange: [0, 1], outputRange: [320, 0] });

  return (
    <View style={st.overlay} pointerEvents="box-none">
      <Animated.View style={[st.scrim, { opacity: a }]} pointerEvents="auto">
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[st.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: sheetY }] }]}>
        <View style={st.headRow}>
          <View style={st.handle} />
          <TouchableOpacity style={st.closeBtn} onPress={onClose} hitSlop={8}>
            <Icon name="close" size={18} color={C.text2} />
          </TouchableOpacity>
        </View>
        <Text style={st.title}>选择播放设备</Text>
        <Text style={st.subtitle}>让音乐在附近设备上继续播放</Text>

        <Text style={st.label}>当前设备</Text>
        <TouchableOpacity
          style={[st.deviceRow, st.deviceRowOn]}
          onPress={() => { setSpeaker(true); onClose(); }}
        >
          <View style={[st.iconWrap, speaker && { backgroundColor: C.brand }]}>
            <Icon name="phone" size={28} color={speaker ? C.onBrand : C.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.deviceName}>此手机</Text>
            <Text style={st.deviceStatusOn}>{playing ? '正在播放 · ' : ''}本机扬声器</Text>
          </View>
          <View style={st.checkBadge}>
            <Icon name="check" size={20} color={C.onBrand} />
          </View>
        </TouchableOpacity>

        <Text style={st.label}>连接外部设备</Text>
        <TouchableOpacity
          style={st.deviceRow}
          onPress={() => {
            onClose();
            try { Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS'); } catch { Linking.openSettings(); }
          }}
        >
          <View style={st.iconWrap}><Icon name="headphones" size={28} /></View>
          <View style={{ flex: 1 }}>
            <Text style={st.deviceName}>蓝牙耳机 / 音响</Text>
            <Text style={st.deviceStatus}>打开系统蓝牙设置连接</Text>
          </View>
          <Icon name="chevronright" size={20} color={C.text3} />
        </TouchableOpacity>
        <TouchableOpacity
          style={st.deviceRow}
          onPress={() => { onClose(); try { Linking.openSettings(); } catch { /* ignore */ } }}
        >
          <View style={st.iconWrap}><Icon name="speaker" size={28} /></View>
          <View style={{ flex: 1 }}>
            <Text style={st.deviceName}>系统声音设置</Text>
            <Text style={st.deviceStatus}>管理所有音频输出</Text>
          </View>
          <Icon name="chevronright" size={20} color={C.text3} />
        </TouchableOpacity>

        <View style={st.volumeRow}>
          <Icon name="volume" size={22} color={C.text2} />
          <Text style={st.volBtn} onPress={() => applyVol(Math.max(0, vol - 10))}>−</Text>
          <View style={st.volumeTrack}>
            <View style={[st.volumeValue, { width: `${vol}%` }]} />
            <View style={[st.volumeThumb, { left: `${vol}%` }]} />
          </View>
          <Text style={st.volBtn} onPress={() => applyVol(Math.min(100, vol + 10))}>＋</Text>
          <Text style={st.volumePct}>{vol}%</Text>
        </View>
        <Text style={st.footer}>连接蓝牙后，系统会自动把播放切换到对应设备</Text>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', zIndex: 100, elevation: 100 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,8,10,0.55)' },
  sheet: {
    backgroundColor: 'rgba(22,22,24,0.96)', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 8,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 28, marginBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF2E' },
  closeBtn: { position: 'absolute', right: 0, top: -4, width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF14', alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  subtitle: { color: C.text2, fontSize: 12, lineHeight: 16, marginTop: 2 },
  label: { color: C.text2, fontSize: 12, lineHeight: 16, marginTop: 18, marginBottom: 8 },
  deviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64,
    backgroundColor: '#232323', borderRadius: 12, paddingHorizontal: 12, marginTop: 6,
  },
  deviceRowOn: { backgroundColor: '#1F3A2A', borderWidth: 1, borderColor: C.brand + '55' },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2E2E2E', alignItems: 'center', justifyContent: 'center' },
  deviceName: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  deviceStatus: { color: C.text2, fontSize: 11, lineHeight: 15 },
  deviceStatusOn: { color: C.brandSoft, fontSize: 11, lineHeight: 15 },
  checkBadge: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: C.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22 },
  volBtn: { color: C.text, fontSize: 18, fontWeight: '600', width: 24, textAlign: 'center' },
  volumeTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#2E2E2E' },
  volumeValue: { height: 4, borderRadius: 2, backgroundColor: C.brand },
  volumeThumb: {
    position: 'absolute', top: -6, width: 16, height: 16, borderRadius: 8,
    backgroundColor: C.white, marginLeft: -8,
  },
  volumePct: { color: C.text2, fontSize: 12, width: 36, textAlign: 'right' },
  footer: { color: C.text3, fontSize: 10, lineHeight: 14, marginTop: 12, textAlign: 'center' },
});
