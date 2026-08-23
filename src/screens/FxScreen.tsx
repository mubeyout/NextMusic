import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { createMMKV } from 'react-native-mmkv';

// Figma NM-FX-001 · 均衡器与音效（滑杆可拖动，状态持久化）
const PRESETS = ['流行', '摇滚', '古典', '爵士', '电子', '自定义'] as const;

// 预设增益（0~1，0.5 为中间）
const PRESET_GAINS: Record<string, number[]> = {
  '流行': [0.55, 0.65, 0.5, 0.45, 0.4],
  '摇滚': [0.7, 0.55, 0.45, 0.55, 0.65],
  '古典': [0.45, 0.5, 0.55, 0.6, 0.6],
  '爵士': [0.5, 0.55, 0.55, 0.5, 0.45],
  '电子': [0.65, 0.5, 0.4, 0.5, 0.7],
};

const BAND_LABELS = ['60Hz', '230Hz', '910Hz', '4kHz', '14kHz'];
const SLIDER_H = 120;

const fxStore = createMMKV({ id: 'nextmusic-fx' });

function loadGains(): number[] {
  const raw = fxStore.getString('gains');
  if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a) && a.length === 5) return a; } catch { /* ignore */ } }
  return [0.5, 0.5, 0.5, 0.5, 0.5];
}

export function FxScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const [enabled, setEnabled] = useState(fxStore.getBoolean('enabled') ?? true);
  const [gains, setGains] = useState<number[]>(loadGains);
  const [preset, setPreset] = useState<string>(fxStore.getString('preset') || '自定义');

  const save = (g: number[], p: string) => {
    setGains(g); setPreset(p);
    fxStore.set('gains', JSON.stringify(g));
    fxStore.set('preset', p);
  };

  const applyPreset = (name: string) => {
    if (name === '自定义') { save(gains, name); return; }
    save(PRESET_GAINS[name] || [0.5, 0.5, 0.5, 0.5, 0.5], name);
  };

  return (
    <View style={[st.screen, { paddingTop: insets.top + 28 }]}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={6} style={{ width: 22 }}>
          <Icon name="back" size={22} />
        </TouchableOpacity>
        <Text style={st.title}>均衡器与音效</Text>
        <TouchableOpacity hitSlop={6} style={{ width: 22 }}>
          <Icon name="more" size={22} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* Enable switch */}
        <View style={st.enableCard}>
          <View style={st.enableRow}>
            <Text style={st.enableLabel}>启用均衡器</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { setEnabled(e => { fxStore.set('enabled', !e); return !e; }); }}>
              <View style={[st.switch, enabled && st.switchOn]}>
                <View style={[st.knob, enabled && st.knobOn]} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Preset pills */}
        <Text style={st.sectionTitle}>预设</Text>
        <View style={st.pillsRow}>
          {PRESETS.map(p => (
            <TouchableOpacity
              key={p}
              style={[st.pill, preset === p && st.pillActive]}
              onPress={() => applyPreset(p)}
              activeOpacity={0.7}
            >
              <Text style={[st.pillText, preset === p && st.pillTextActive]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* EQ bands card（可拖动） */}
        <View style={st.eqCard}>
          <View style={st.bandsRow}>
            {BAND_LABELS.map((label, i) => (
              <BandSlider
                key={label}
                label={label}
                value={gains[i]}
                disabled={!enabled}
                onChange={v => {
                  const next = [...gains]; next[i] = v;
                  save(next, '自定义');
                }}
              />
            ))}
          </View>
        </View>

        {/* Effect settings rows（占位功能，勿删入口） */}
        <Text style={st.sectionTitle}>空间音效</Text>
        <View style={st.effectCard}>
          <View style={st.effectContent}>
            <Text style={st.effectTitle}>大厅混响</Text>
            <Text style={st.effectSubtitle}>中等 · 需要系统 DSP 支持</Text>
          </View>
          <Icon name="chevronright" size={20} color={C.text2} />
        </View>
        <View style={st.effectCard}>
          <View style={st.effectContent}>
            <Text style={st.effectTitle}>空间音频</Text>
            <Text style={st.effectSubtitle}>当前设备不可用</Text>
          </View>
          <Icon name="chevronright" size={20} color={C.text2} />
        </View>
      </ScrollView>
    </View>
  );
}

/* 垂直拖动滑杆：触摸区加宽，locationY 相对于触摸容器，固定高度 SLIDER_H */
function BandSlider({ label, value, onChange, disabled }: {
  label: string; value: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  const clamp = (y: number) => Math.min(1, Math.max(0, 1 - y / SLIDER_H));
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (e: any) => onChange(clamp(e.nativeEvent.locationY)),
    onPanResponderMove: (e: any) => onChange(clamp(e.nativeEvent.locationY)),
  }), [disabled, onChange]);

  const valH = Math.round(SLIDER_H * value);
  return (
    <View style={st.bandCol}>
      <View style={[st.touch, disabled && st.sliderOff]} {...pan.panHandlers}>
        <View style={st.sliderTrack}>
          <View style={[st.sliderValue, { height: valH }]} />
          <View style={[st.sliderThumb, { bottom: valH - 7 }]} />
        </View>
      </View>
      <Text style={st.bandLabel}>{label}</Text>
      <Text style={st.bandGain}>{value > 0.5 ? '+' : ''}{Math.round((value - 0.5) * 12)}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    height: 40, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, marginBottom: 8,
  },
  title: {
    flex: 1, color: C.text, fontSize: 24, lineHeight: 35,
    fontWeight: '700', textAlign: 'center',
  },
  enableCard: { borderRadius: 12, backgroundColor: '#1c1c1c', padding: 12, marginBottom: 10 },
  enableRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  enableLabel: { flex: 1, color: C.text, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  switch: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#2E2E2E', padding: 2, justifyContent: 'center' },
  switchOn: { backgroundColor: C.brand },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#8E8E8E' },
  knobOn: { backgroundColor: '#FFFFFF', alignSelf: 'flex-end' },
  sectionTitle: {
    color: C.text, fontSize: 17, lineHeight: 25, fontWeight: '700',
    marginBottom: 10,
  },
  pillsRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  pill: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
    backgroundColor: '#242424',
  },
  pillActive: { backgroundColor: C.brand },
  pillText: { color: '#B3B3B3', fontSize: 11, lineHeight: 16, fontWeight: '500' },
  pillTextActive: { color: '#121212', fontSize: 11, lineHeight: 16, fontWeight: '500' },
  eqCard: {
    borderRadius: 12, backgroundColor: '#1c1c1c', padding: 12,
    marginBottom: 10,
  },
  bandsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 },
  bandCol: { flex: 1, alignItems: 'center', gap: 6 },
  sliderTrack: {
    height: SLIDER_H, width: 4, borderRadius: 2, backgroundColor: '#242424',
    alignSelf: 'center', justifyContent: 'flex-end',
  },
  touch: { width: 28, height: SLIDER_H, alignItems: 'center', justifyContent: 'center' },
  sliderOff: { opacity: 0.4 },
  sliderValue: {
    height: 60, borderRadius: 2, backgroundColor: C.brand,
    width: 4,
  },
  sliderThumb: {
    position: 'absolute', alignSelf: 'center', width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#FFFFFF', marginLeft: 0,
  },
  bandLabel: { color: '#B3B3B3', fontSize: 9, lineHeight: 12 },
  bandGain: { color: C.text2, fontSize: 9, lineHeight: 12, fontWeight: '500' },
  effectCard: {
    borderRadius: 12, backgroundColor: '#1c1c1c', padding: 12,
    flexDirection: 'row', alignItems: 'center', marginBottom: 10,
  },
  effectContent: { flex: 1 },
  effectTitle: { color: C.text, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  effectSubtitle: { color: C.text2, fontSize: 11, lineHeight: 15 },
});
