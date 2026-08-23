import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { AudioPro, useAudioPro } from 'react-native-audio-pro';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';

// 播放设备选择：真实本机输出 + 系统蓝牙入口 + 真实播放音量（AudioPro）
// 说明：RN 层无法枚举蓝牙设备（需原生模块），此处只展示真实可确认的状态，
// 蓝牙/外部音响切换引导到系统蓝牙设置完成。
export function RouteScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const volume = useAudioPro(s => s.volume);
  const playerState = useAudioPro(s => s.playerState);
  const [vol, setVol] = useState<number>(Math.round((volume ?? 1) * 100));
  const [speaker, setSpeaker] = useState(true); // 本机扬声器输出
  const playing = playerState === 'PLAYING';

  const applyVol = (v: number) => {
    setVol(v);
    AudioPro.setVolume(v / 100);
  };

  return (
    <Modal animationType="slide" transparent onRequestClose={() => nav.goBack()}>
      <View style={st.scrim}>
        <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={st.handle} />
          <TouchableOpacity style={st.closeBtn} onPress={() => nav.goBack()}>
            <Icon name="close" size={20} />
          </TouchableOpacity>
          <Text style={st.title}>选择播放设备</Text>
          <Text style={st.subtitle}>让音乐在附近设备上继续播放</Text>

          <Text style={st.label}>当前设备</Text>
          <TouchableOpacity style={[st.deviceRow, st.deviceRowOn]} onPress={() => setSpeaker(true)}>
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
          <TouchableOpacity style={st.deviceRow} onPress={() => { try { Linking.openSettings(); } catch { /* ignore */ } }}>
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
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A1A1A', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 8,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF2E', marginBottom: 10 },
  closeBtn: { position: 'absolute', right: 16, top: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  subtitle: { color: C.text2, fontSize: 12, lineHeight: 16, marginTop: 2 },
  label: { color: C.text2, fontSize: 12, lineHeight: 16, marginTop: 18, marginBottom: 8 },
  deviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64,
    backgroundColor: '#232323', borderRadius: 12, paddingHorizontal: 12, marginTop: 6,
  },
  deviceRowOn: { backgroundColor: '#1F3A2A', borderWidth: 1, borderColor: '#1ED76055' },
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
