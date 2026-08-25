import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, PanResponder, TextInput, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { ActionSheet } from '../components/ActionSheet';
import {
  FX_DEFAULT_PRESETS, FX_FREQ_LABELS, FX_REVERB_OPTIONS,
  subscribeFx, fxSnapshot, fxSyncState, fetchFxFromServer,
  setEQ, resetEQ, applyFxPreset, setReverb, setReverbGain,
  setFxPitch, resetFxPitch, setPanner,
  saveNewPreset, renameCustomPreset, deleteCustomPreset,
} from '../services/soundfx';

// 3.4.0-lx13 重设计：对齐 App 设计语言（Bold 大标题 / #1A1A1A r12 卡片 / #232323 内嵌控制块 / 绿胶囊选中）
// 结构：预设胶囊横滚 → 垂直 10 段 EQ → 环境混响（胶囊网格 + 增益滑杆）→ 音调 → 3D 环绕
// 数据与同步逻辑不变（soundfx.ts / 原生 DSP 全复用）

// ---------- 横向滑杆（PanResponder，左起填充） ----------
function HSlider({ value, min, max, step, onChange, disabled, style }: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean; style?: object;
}) {
  const [w, setW] = useState(0);
  const latest = useRef({ min, max, step, onChange, w });
  latest.current = { min, max, step, onChange, w };

  const handle = (x: number) => {
    const { min: mn, max: mx, step: st, onChange: cb, w: width } = latest.current;
    if (!width) return;
    const ratio = Math.max(0, Math.min(1, x / width));
    const raw = mn + ratio * (mx - mn);
    cb(Math.round(raw / st) * st);
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (e) => handle(e.nativeEvent.locationX),
    onPanResponderMove: (e) => handle(e.nativeEvent.locationX),
  }), [disabled]);

  const ratio = max > min ? (value - min) / (max - min) : 0;
  const r = Math.max(0, Math.min(1, ratio));

  return (
    <View
      style={[hs.track, disabled && hs.trackDisabled, style]}
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      {...pan.panHandlers}
    >
      <View style={hs.rail} pointerEvents="none" />
      <View style={[hs.fill, { width: r * w }]} pointerEvents="none" />
      <View style={[hs.thumb, { left: (w ? r * w : 0) - 7 }]} pointerEvents="none" />
    </View>
  );
}

const hs = StyleSheet.create({
  track: { height: 28, justifyContent: 'center' },
  trackDisabled: { opacity: 0.4 },
  rail: { position: 'absolute', left: 0, right: 0, top: 11, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF17' },
  fill: { position: 'absolute', left: 0, top: 11, height: 6, borderRadius: 3, backgroundColor: C.brand },
  thumb: { position: 'absolute', top: 7, width: 14, height: 14, borderRadius: 7, backgroundColor: C.brand, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, elevation: 3 },
});

// ---------- 垂直 EQ 滑杆（中点 0dB，向上下双向增益） ----------
function VSlider({ value, min, max, step, onChange, height = 150 }: {
  value: number; min: number; max: number; step: number; height?: number;
  onChange: (v: number) => void;
}) {
  const [h, setH] = useState(height);
  const latest = useRef({ min, max, step, onChange, h });
  latest.current = { min, max, step, onChange, h };

  const handle = (y: number) => {
    const { min: mn, max: mx, step: st, onChange: cb, h: ht } = latest.current;
    if (!ht) return;
    const ratio = Math.max(0, Math.min(1, 1 - y / ht)); // 底=mn 顶=mx
    const raw = mn + ratio * (mx - mn);
    cb(Math.round(raw / st) * st);
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => handle(e.nativeEvent.locationY),
    onPanResponderMove: (e) => handle(e.nativeEvent.locationY),
  }), []);

  const ratio = max > min ? (value - min) / (max - min) : 0.5;
  const r = Math.max(0, Math.min(1, ratio));
  const thumbY = (h ? (1 - r) * h : 0) - 2; // thumb 高 4，中心对齐
  const center = h / 2;
  // 从中点向 thumb 填充
  const fillTop = value >= 0 ? thumbY + 4 : center;
  const fillH = Math.max(2, Math.abs(center - (thumbY + 2)));

  return (
    <View
      style={[vs.col, { height }]}
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      {...pan.panHandlers}
    >
      <View style={vs.rail} pointerEvents="none" />
      <View style={vs.zero} pointerEvents="none" />
      <View style={[vs.fill, { top: fillTop, height: fillH }]} pointerEvents="none" />
      <View style={[vs.thumb, { top: thumbY }]} pointerEvents="none" />
    </View>
  );
}

const vs = StyleSheet.create({
  col: { width: '100%', alignItems: 'center' },
  rail: { position: 'absolute', top: 0, bottom: 0, left: '50%', marginLeft: -2, width: 4, borderRadius: 2, backgroundColor: '#FFFFFF14' },
  zero: { position: 'absolute', top: '50%', marginTop: -0.5, left: 2, right: 2, height: 1, backgroundColor: '#FFFFFF2A' },
  fill: { position: 'absolute', left: '50%', marginLeft: -2, width: 4, borderRadius: 2, backgroundColor: C.brand },
  thumb: { position: 'absolute', left: '50%', marginLeft: -9, width: 18, height: 4, borderRadius: 2, backgroundColor: C.brand, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 3, elevation: 3 },
});

// ---------- 卡片内滑杆块（#232323 r12：标签 + 值 + 横滑杆） ----------
function SRow({ label, valueLabel, value, min, max, step, onChange, disabled, style }: {
  label: string; valueLabel: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean; style?: object;
}) {
  return (
    <View style={[st.srow, disabled && st.srowDisabled, style]}>
      <View style={st.srowHead}>
        <Text style={st.srowLabel}>{label}</Text>
        <Text style={st.srowValue}>{valueLabel}</Text>
      </View>
      <HSlider value={value} min={min} max={max} step={step} onChange={onChange} disabled={disabled} />
    </View>
  );
}

// ---------- 页面 ----------
export function FxScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const [, force] = useState(0);
  const [presetSheet, setPresetSheet] = useState<{ mode: 'add' | 'rename'; name?: string } | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [managePreset, setManagePreset] = useState<string | null>(null);

  useEffect(() => subscribeFx(() => force(x => x + 1)), []);
  useEffect(() => { fetchFxFromServer(); }, []);

  const { settings, customPresets, activePresetName } = fxSnapshot();
  const sync = fxSyncState();
  const revDisabled = settings.reverb.id === 'none';

  const allPresetNames = [...FX_DEFAULT_PRESETS.map(p => p.name), ...customPresets.map(p => p.name)];
  const eqTouched = settings.eq.some(g => g !== 0);
  const currentReverb = FX_REVERB_OPTIONS.find(r => r.id === settings.reverb.id);

  return (
    <View style={[st.screen, { paddingTop: insets.top + 10 }]}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={6} style={{ width: 26 }}>
          <Icon name="back" size={20} />
        </TouchableOpacity>
        <Text style={st.title}>均衡器与音效</Text>
        <View style={st.syncBadge}>
          <View style={[st.syncDot, sync === 'synced' && st.syncDotOn]} />
          <Text style={st.syncText}>{sync === 'synced' ? '已同步' : sync === 'local' ? '本地' : '同步中'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {/* ===== 快速预设（横滚胶囊） ===== */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.presetScroll}>
          {allPresetNames.map(name => {
            const active = activePresetName === name;
            const isCustom = customPresets.some(p => p.name === name);
            return (
              <TouchableOpacity
                key={name}
                style={[st.chip, active && st.chipOn]}
                activeOpacity={0.7}
                onPress={() => applyFxPreset(name)}
                onLongPress={isCustom ? () => setManagePreset(name) : undefined}
              >
                <Text style={[st.chipText, active && st.chipTextOn]}>{name}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={st.chipAdd} activeOpacity={0.7} onPress={() => { setInputVal(''); setPresetSheet({ mode: 'add' }); }}>
            <Text style={st.chipAddText}>＋</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ===== 均衡器（垂直 10 段） ===== */}
        <View style={st.card}>
          <View style={st.cardHead}>
            <Text style={st.cardTitle}>均衡器</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {activePresetName ? <Text style={st.presetNameOn}>{activePresetName}</Text> : null}
              {eqTouched ? (
                <TouchableOpacity onPress={resetEQ} hitSlop={4}>
                  <Text style={st.linkBtn}>重置</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <View style={st.eqGrid}>
            {FX_FREQ_LABELS.map((label, i) => {
              const g = settings.eq[i];
              return (
                <View key={label} style={st.eqCol}>
                  <Text style={[st.eqDb, g > 0 && st.eqDbHot, g < 0 && st.eqDbLow]}>{g > 0 ? '+' : ''}{g}</Text>
                  <VSlider value={g} min={-12} max={12} step={1} onChange={v => setEQ(i, v)} />
                  <Text style={st.eqFreq}>{label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ===== 环境混响 ===== */}
        <View style={st.card}>
          <View style={st.cardHead}>
            <Text style={st.cardTitle}>环境混响</Text>
            <Text style={st.cardMeta} numberOfLines={1}>{currentReverb?.name ?? '关闭'}</Text>
          </View>
          <View style={st.revGrid}>
            {FX_REVERB_OPTIONS.map(r => {
              const on = settings.reverb.id === r.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[st.chip, st.revChip, on && st.chipOn]}
                  activeOpacity={0.7}
                  onPress={() => setReverb(r.id)}
                >
                  <Text style={[st.chipText, on && st.chipTextOn]} numberOfLines={1}>{r.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <SRow
            style={{ marginTop: 12 }}
            label="原始音量 (DRY)" valueLabel={Math.round(settings.reverb.mainGain * 100) + '%'}
            value={settings.reverb.mainGain * 100} min={0} max={300} step={5}
            onChange={v => setReverbGain('main', v / 100)} disabled={revDisabled}
          />
          <SRow
            style={{ marginTop: 8 }}
            label="环境音效 (WET)" valueLabel={Math.round(settings.reverb.sendGain * 100) + '%'}
            value={settings.reverb.sendGain * 100} min={0} max={300} step={5}
            onChange={v => setReverbGain('send', v / 100)} disabled={revDisabled}
          />
        </View>

        {/* ===== 音调升降 ===== */}
        <View style={st.card}>
          <View style={st.cardHead}>
            <Text style={st.cardTitle}>音调升降</Text>
            {settings.pitch !== 1 ? (
              <TouchableOpacity onPress={resetFxPitch} hitSlop={4}>
                <Text style={st.linkBtn}>重置</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <SRow
            label="音调" valueLabel={settings.pitch.toFixed(2) + 'x'}
            value={settings.pitch} min={0.5} max={2} step={0.01} onChange={setFxPitch}
          />
        </View>

        {/* ===== 3D 立体环绕 ===== */}
        <View style={st.card}>
          <View style={st.cardHead}>
            <Text style={st.cardTitle}>3D 立体环绕<Text style={st.cardHint}>（需使用耳机）</Text></Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setPanner({ enable: !settings.panner.enable })}>
              <View style={[st.switch, settings.panner.enable && st.switchOn]}>
                <View style={[st.knob, settings.panner.enable && st.knobOn]} />
              </View>
            </TouchableOpacity>
          </View>
          <SRow
            style={{ opacity: settings.panner.enable ? 1 : 0.4 }}
            label="环绕速度" valueLabel={String(settings.panner.speed)}
            value={settings.panner.speed} min={1} max={50} step={1}
            onChange={v => setPanner({ speed: v })} disabled={!settings.panner.enable}
          />
          <SRow
            style={{ marginTop: 8, opacity: settings.panner.enable ? 1 : 0.4 }}
            label="声音距离" valueLabel={String(settings.panner.distance)}
            value={settings.panner.distance} min={1} max={30} step={1}
            onChange={v => setPanner({ distance: v })} disabled={!settings.panner.enable}
          />
        </View>

        <Text style={st.syncCaption}>
          {sync === 'synced' ? '已与服务器同步（Web 播放器共享）' : sync === 'local' ? '本地模式：未登录，设置仅保存在本机' : '同步中…'}
        </Text>
      </ScrollView>

      {/* 添加 / 重命名预设 */}
      <ActionSheet
        visible={presetSheet !== null}
        onClose={() => setPresetSheet(null)}
        title={presetSheet?.mode === 'rename' ? '重命名预设' : '添加自定义预设'}
        items={[]}
        extra={
          <View style={st.sheetInputRow}>
            <TextInput
              style={st.sheetInput}
              value={inputVal}
              onChangeText={setInputVal}
              placeholder={presetSheet?.mode === 'rename' ? '新名称…' : '输入名称…'}
              placeholderTextColor={C.text3}
              maxLength={12}
              autoFocus
            />
            <TouchableOpacity
              style={st.sheetInputOk}
              onPress={() => {
                if (!presetSheet) return;
                const err = presetSheet.mode === 'rename'
                  ? renameCustomPreset(presetSheet.name!, inputVal)
                  : saveNewPreset(inputVal);
                if (err) setInputVal(err);
                else setPresetSheet(null);
              }}
            >
              <Text style={st.sheetInputOkText}>确定</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* 管理自定义预设（长按） */}
      <ActionSheet
        visible={managePreset !== null}
        onClose={() => setManagePreset(null)}
        title={`预设「${managePreset ?? ''}」`}
        items={[
          {
            label: '重命名', onPress: () => {
              setInputVal(managePreset ?? '');
              setPresetSheet({ mode: 'rename', name: managePreset ?? undefined });
            },
          },
          {
            label: '删除', danger: true, onPress: () => { if (managePreset) deleteCustomPreset(managePreset); },
          },
        ]}
      />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  title: { color: C.text, fontSize: 20, fontWeight: '800', flex: 1, textAlign: 'center' },
  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 26 + 46, justifyContent: 'flex-end' },
  syncDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.text3 },
  syncDotOn: { backgroundColor: C.brand },
  syncText: { color: C.text2, fontSize: 10, fontWeight: '600' },

  content: { paddingHorizontal: 20, paddingBottom: 40 },

  // 预设胶囊（横滚）
  presetScroll: { gap: 8, paddingBottom: 4, marginBottom: 12 },
  chip: { paddingHorizontal: 14, height: 32, borderRadius: 16, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: C.brand },
  chipText: { color: C.text2, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: C.onBrand, fontWeight: '800' },
  chipAdd: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#FFFFFF2A', alignItems: 'center', justifyContent: 'center' },
  chipAddText: { color: C.text3, fontSize: 15, fontWeight: '800', lineHeight: 17 },

  // 卡片
  card: { backgroundColor: C.surface, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  cardMeta: { color: C.brand, fontSize: 11, fontWeight: '700', maxWidth: 120 },
  cardHint: { color: C.text3, fontSize: 11, fontWeight: '500' },
  linkBtn: { color: C.brand, fontSize: 11, fontWeight: '800' },
  presetNameOn: { color: C.text2, fontSize: 11, fontWeight: '600' },

  // EQ 垂直网格
  eqGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  eqCol: { width: '9%', alignItems: 'center', gap: 6 },
  eqDb: { color: C.text3, fontSize: 9, fontWeight: '800', height: 12 },
  eqDbHot: { color: C.brand },
  eqDbLow: { color: C.brandSoft },
  eqFreq: { color: C.text2, fontSize: 9, fontWeight: '600' },

  // 混响胶囊网格（4 列）
  revGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  revChip: { width: '23%', paddingHorizontal: 0, height: 30 },

  // 卡片内滑杆块
  srow: { backgroundColor: C.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  srowDisabled: { opacity: 0.4 },
  srowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  srowLabel: { color: C.text2, fontSize: 12, fontWeight: '600' },
  srowValue: { color: C.text, fontSize: 12, fontWeight: '800' },

  // 3D 开关
  switch: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF20', padding: 3 },
  switchOn: { backgroundColor: C.brand },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  knobOn: { alignSelf: 'flex-end' },

  syncCaption: { color: C.text3, fontSize: 10, textAlign: 'center', marginTop: 2 },

  // sheet
  sheetInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  sheetInput: { flex: 1, backgroundColor: '#FFFFFF0F', borderRadius: 12, paddingHorizontal: 14, height: 44, color: C.text, fontSize: 15 },
  sheetInputOk: { backgroundColor: C.brand, borderRadius: 12, paddingHorizontal: 18, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetInputOkText: { color: C.onBrand, fontSize: 14, fontWeight: '800' },
});
