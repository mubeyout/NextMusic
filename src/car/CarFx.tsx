// CarFx.tsx —— [A3 FX 音效车机形态·LEO v75 缺口包 1107·老板令 0927] 预设优先四卡 > 五段精简 EQ > 深度模式(乘客)降级;3D/变调/混响 chips
// 车机价值重排:预设>微调(驾驶安全);十段全量 EQ 留给乘客走 phone FxScreen
// [1107 设计对齐核查] 预设卡 accent 渐变分色(LEO v75 master --ac3/4/7/8)+active 2px brand 描边;文案/分区 label 逐字对稿
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { CAR, CAR_FS } from './cartokens';
import { C } from '../theme/tokens';
import { Icon } from '../theme/Icon';
import { useNavigation } from '@react-navigation/native';
import { fxSnapshot, subscribeFx, applyFxPreset, resetEQ, setEQ, setReverb, setFxPitch, setPanner, FX_DEFAULT_PRESETS } from '../services/soundfx';

// 五段精简 EQ ↔ 十段表映射(31/125/1k/4k/16k)
const BANDS: { idx: number; label: string }[] = [
  { idx: 0, label: '31' }, { idx: 2, label: '125' }, { idx: 5, label: '1k' }, { idx: 7, label: '4k' }, { idx: 9, label: '16k' },
];
const PITCH_CYCLE = [1, 1.25, 1.5, 0.75];
const REVERB_CYCLE = [{ id: 'none', label: '关' }, { id: 'hall', label: '大厅' }, { id: 'church', label: '教堂' }];

// [LEO v75 master] 预设卡 accent(135° 渐变:亮 85%→本色→暗 68%)
const PRESET_ACCENTS: Record<string, [string, string, string]> = {
  '原声': ['#8a7157', '#5A4632', '#3b2f21'],
  '人声增强': ['#8a5462', '#5C2F3F', '#3d1f2a'],
  '重低音': ['#547a6f', '#31564C', '#213831'],
  '古典厅堂': ['#71717c', '#4A4A55', '#31313a'],
};

export function CarFx({ onBack }: { onBack: () => void }) {
  const nav = useNavigation() as { navigate: (s: string) => void };
  const [snap, setSnap] = useState(fxSnapshot());
  const fx = snap.settings; // FxSettings 直读(fxSnapshot 返回 {settings,...} 包装)
  useEffect(() => subscribeFx(() => setSnap(fxSnapshot())), []);

  const eqMatches = (name: string) => {
    const p = FX_DEFAULT_PRESETS.find(x => x.name === name);
    return !!p && p.values.every((v, i) => v === fx.eq[i]);
  };
  const revOn = fx.reverb.id !== 'none';

  const presets = useMemo(() => [
    { name: '原声', sub: '直通 · 当前', apply: () => { resetEQ(); setReverb('none'); }, match: (eq: number[], rev: string) => eq.every(v => v === 0) && rev === 'none' },
    { name: '人声增强', sub: '播客 · 相声推荐', apply: () => applyFxPreset('人声'), match: eq => eqMatches('人声') },
    { name: '重低音', sub: '电子 · 嘻哈', apply: () => applyFxPreset('重低音'), match: eq => eqMatches('重低音') },
    { name: '古典厅堂', sub: 'IR 卷积混响', apply: () => { applyFxPreset('古典'); setReverb('church'); }, match: (eq, rev) => eqMatches('古典') && rev === 'church' },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [snap]);

  const revLabel = REVERB_CYCLE.find(r => r.id === fx.reverb.id)?.label ?? REVERB_CYCLE[0].label;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: CAR.gutter, paddingBottom: CAR.playbar.h + 40 }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <TouchableOpacity style={st.backBtn} onPress={onBack}><Icon name="back" size={20} color={C.text2} /></TouchableOpacity>
        <Text style={{ color: C.text, fontSize: CAR_FS.hero, fontWeight: '800', flex: 1 }}>音效</Text>
      </View>
      <Text style={st.subtitle}>预设 · 均衡器 · 空间感</Text>

      {/* 场景预设(accent 渐变四卡,优先) */}
      <Text style={st.secLabel}>场景预设</Text>
      <View style={st.presetGrid}>
        {presets.map(p => {
          const on = p.match(fx.eq, fx.reverb.id);
          const grad = PRESET_ACCENTS[p.name];
          return (
            <TouchableOpacity key={p.name} activeOpacity={0.85} onPress={p.apply}
              style={[st.presetCard, on && { borderWidth: 2, borderColor: C.brand }]}>
              <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ ...st.presetGrad, paddingVertical: 20 }}>
                <Text style={st.presetName}>{p.name}</Text>
                <Text style={st.presetSub}>{p.sub}</Text>
              </LinearGradient>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 五段精简 EQ(±1 步进——LEO 裁定采纳,替代滑杆) */}
      <Text style={st.secLabel}>五段均衡</Text>
      <View style={st.eqCard}>
        {BANDS.map(b => (
          <View key={b.idx} style={st.eqRow}>
            <Text style={st.eqFreq}>{b.label}</Text>
            <TouchableOpacity style={st.eqStep} onPress={() => setEQ(b.idx, Math.max(-12, (fx.eq[b.idx] ?? 0) - 1))}><Text style={st.eqStepText}>−</Text></TouchableOpacity>
            <View style={st.eqValueWrap}><Text style={[st.eqValue, (fx.eq[b.idx] ?? 0) !== 0 && { color: C.brand }]}>{(fx.eq[b.idx] ?? 0) > 0 ? '+' : ''}{fx.eq[b.idx] ?? 0}</Text></View>
            <TouchableOpacity style={st.eqStep} onPress={() => setEQ(b.idx, Math.min(12, (fx.eq[b.idx] ?? 0) + 1))}><Text style={st.eqStepText}>＋</Text></TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={st.deepBtn} onPress={() => nav.navigate('Fx')}>
          <Text style={st.deepText}>十段均衡 · 深度模式（乘客）›</Text>
        </TouchableOpacity>
      </View>

      {/* 空间感 */}
      <Text style={st.secLabel}>空间感</Text>
      <View style={st.chips}>
        <TouchableOpacity style={[st.chip, fx.panner.enable && st.chipOn]} onPress={() => setPanner({ enable: !fx.panner.enable })}>
          <Text style={[st.chipText, fx.panner.enable && { color: C.brand }]}>3D 声像 · {fx.panner.enable ? '开' : '关'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.chip} onPress={() => setFxPitch(PITCH_CYCLE[(PITCH_CYCLE.findIndex(v => v === fx.pitch) + 1) % PITCH_CYCLE.length] ?? 1)}>
          <Text style={st.chipText}>变调 {fx.pitch.toFixed(2)}×</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.chip, revOn && st.chipOn]} onPress={() => setReverb(REVERB_CYCLE[(REVERB_CYCLE.findIndex(r => r.id === fx.reverb.id) + 1) % REVERB_CYCLE.length].id)}>
          <Text style={[st.chipText, revOn && { color: C.brand }]}>混响 · {revLabel}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const st = {
  backBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  subtitle: { color: C.text3, fontSize: CAR_FS.mini, letterSpacing: 2, marginBottom: 6, paddingLeft: 62 },
  secLabel: { color: C.text3, fontSize: CAR_FS.mini, letterSpacing: 2, marginTop: 22, marginBottom: 12 },
  presetGrid: { flexDirection: 'row' as const, gap: CAR.gap },
  presetCard: { flex: 1, borderRadius: 17, overflow: 'hidden' as const, borderWidth: 0, borderColor: 'transparent' },
  presetGrad: { minHeight: 132, justifyContent: 'center' as const, gap: 6 },
  presetName: { color: '#FFFFFF', fontSize: CAR_FS.title, fontWeight: '800' as const },
  presetSub: { color: '#FFFFFFB3', fontSize: CAR_FS.mini },
  eqCard: { borderRadius: 17, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, padding: 20, gap: 6 },
  eqRow: { flexDirection: 'row' as const, alignItems: 'center' as const, height: 52, gap: 14 },
  eqFreq: { width: 56, color: C.text2, fontSize: CAR_FS.sub, fontVariant: ['tabular-nums' as never] },
  eqStep: { width: 52, height: 44, borderRadius: 12, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  eqStepText: { color: C.text, fontSize: CAR_FS.title, fontWeight: '700' as const },
  eqValueWrap: { flex: 1, alignItems: 'center' as const },
  eqValue: { color: C.text2, fontSize: CAR_FS.body, fontVariant: ['tabular-nums' as never] },
  deepBtn: { marginTop: 14, height: 48, borderRadius: 13, borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: C.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  deepText: { color: C.text3, fontSize: CAR_FS.sub },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  chip: { height: 48, paddingHorizontal: 22, borderRadius: 24, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const },
  chipOn: { backgroundColor: C.brandDim },
  chipText: { color: C.text, fontSize: CAR_FS.sub, fontWeight: '600' as const },
};
