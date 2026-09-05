import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, PanResponder, TextInput, LayoutChangeEvent } from 'react-native';
import { IS_HD } from '../services/appversion';
import { HDTouch } from '../hd/HDTouch';


// 触点抽象:HD(车机/TV)用 HDTouch(D-pad 焦点环),phone 保持 TouchableOpacity
function T(props: { style?: unknown; onPress?: () => void; disabled?: boolean; children?: React.ReactNode; activeOpacity?: number } & Record<string, unknown>) {
  const { style, onPress, disabled, children, ...rest } = props;
  if (IS_HD) return (
    <HDTouch style={style as never} onPress={onPress} disabled={disabled} focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 12 }} {...(rest as object)}>
      {children}
    </HDTouch>
  );
  return (
    <TouchableOpacity style={style as never} onPress={onPress} disabled={disabled} activeOpacity={0.7} {...(rest as object)}>
      {children}
    </TouchableOpacity>
  );
}

// TV 步进钮:滑杆的 D-pad 等价物(焦点即选中,OK/点击 = ±step)
function StepBtn({ d, onPress }: { d: -1 | 1; onPress: () => void }) {
  return (
    <HDTouch onPress={onPress} style={{ width: 30, height: 34, borderRadius: 8, backgroundColor: C.elev, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.text, fontSize: 15, fontWeight: '800', lineHeight: 18 }}>{d < 0 ? '−' : '+'}</Text>
    </HDTouch>
  );
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { toast } from '../components/Dialog';
import { ActionSheet } from '../components/ActionSheet';
import {
  FX_DEFAULT_PRESETS, FX_FREQ_LABELS, FX_REVERB_OPTIONS,
  subscribeFx, fxSnapshot, fxSyncState, fetchFxFromServer,
  setEQ, resetEQ, applyFxPreset, setReverb, setReverbGain,
  setFxPitch, resetFxPitch, setPanner, setViper,
  saveNewPreset, renameCustomPreset, deleteCustomPreset,
  AUTOEQ_MODELS, autoeqProfile,
  SOUND_MODES, applySoundMode, currentSoundMode,
} from '../services/soundfx';
import type { FxViper } from '../services/soundfx';

// 3.4.0-lx13 重设计：对齐 App 设计语言（Bold 大标题 / #1A1A1A r12 卡片 / #232323 内嵌控制块 / 绿胶囊选中）
// 结构：预设胶囊横滚 → 垂直 10 段 EQ → 环境混响（胶囊网格 + 增益滑杆）→ 音调 → 3D 环绕
// 数据与同步逻辑不变（soundfx.ts / 原生 DSP 全复用）

// ---------- 横向滑杆（PanResponder，左起填充；拖动只预览，松手才提交） ----------
// 触点抽象:HD(车机/TV)用 HDTouch(D-pad 焦点环),phone 保持 TouchableOpacity

// ===== TV 行式音效控件:标签 | 轨道可视化 | 数值 | 步进钮 =====

function FxRow({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  const r = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return (
    <View style={fxrowSt.row}>
      <Text style={fxrowSt.label}>{label}</Text>
      <View style={fxrowSt.track}>
        <View style={[fxrowSt.halfA, { flex: r }]} />
        <View style={fxrowSt.bar} />
        <View style={[fxrowSt.halfB, { flex: 1 - r }]} />
      </View>
      <Text style={fxrowSt.val}>{fmt ? fmt(value) : (value > 0 ? '+' : '') + value}</Text>
      <StepBtn d={-1} onPress={() => onChange(Math.max(min, Math.round((value - step) / step) * step))} />
      <StepBtn d={1} onPress={() => onChange(Math.min(max, Math.round((value + step) / step) * step))} />
    </View>
  );
}

const fxrowSt = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 5 },
  label: { color: C.text2, fontSize: 13, width: 56, fontVariant: ['tabular-nums'] },
  track: { flex: 1, height: 8, flexDirection: 'row', alignItems: 'center' },
  halfA: { height: 8, backgroundColor: C.brand, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  halfB: { height: 8, backgroundColor: C.inset },
  bar: { width: 2, height: 14, borderRadius: 1, backgroundColor: C.text },
  val: { color: C.text, fontSize: 14, fontWeight: '600', width: 64, textAlign: 'right', fontVariant: ['tabular-nums'] },
});

function HSlider({ value, min, max, step, onChange, disabled, style }: {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean; style?: object;
}) {
  const [w, setW] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const latest = useRef({ min, max, step, onChange, w, pending: null as number | null });
  latest.current = { min, max, step, onChange, w, pending: latest.current.pending };

  const handle = (x: number) => {
    const { min: mn, max: mx, step: st, w: width } = latest.current;
    if (!width) return;
    const ratio = Math.max(0, Math.min(1, x / width));
    const raw = mn + ratio * (mx - mn);
    const v = Math.round(raw / st) * st;
    latest.current.pending = v;
    setDrag(v);
  };

  const release = () => {
    const v = latest.current.pending;
    latest.current.pending = null;
    setDrag(null);
    if (v != null) latest.current.onChange(v);
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: (e) => handle(e.nativeEvent.locationX),
    onPanResponderMove: (e) => handle(e.nativeEvent.locationX),
    onPanResponderRelease: release,
    onPanResponderTerminate: release,
  }), [disabled]);

  const shown = drag ?? value;
  const ratio = max > min ? (shown - min) / (max - min) : 0;
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
      {IS_HD && !disabled ? (
        <View style={{ position: 'absolute', right: -2, top: -6, flexDirection: 'row', gap: 4 }}>
          <StepBtn d={-1} onPress={() => onChange(Math.max(min, Math.round((value - step) / step) * step))} />
          <StepBtn d={1} onPress={() => onChange(Math.min(max, Math.round((value + step) / step) * step))} />
        </View>
      ) : null}
    </View>
  );
}

const hs = StyleSheet.create({
  track: { height: 28, justifyContent: 'center' },
  trackDisabled: { opacity: 0.4 },
  rail: { position: 'absolute', left: 0, right: 0, top: 11, height: 6, borderRadius: 3, backgroundColor: C.stroke },
  fill: { position: 'absolute', left: 0, top: 11, height: 6, borderRadius: 3, backgroundColor: C.brand },
  thumb: { position: 'absolute', top: 7, width: 14, height: 14, borderRadius: 7, backgroundColor: C.brand, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, elevation: 3 },
});

// ---------- 垂直 EQ 滑杆（中点 0dB，双向增益；拖动只预览，松手才提交） ----------
function VSlider({ value, min, max, step, onChange, height = 150 }: {
  value: number; min: number; max: number; step: number; height?: number;
  onChange: (v: number) => void;
}) {
  const [h, setH] = useState(height);
  const [drag, setDrag] = useState<number | null>(null);
  const latest = useRef({ min, max, step, onChange, h, pending: null as number | null });
  latest.current = { min, max, step, onChange, h, pending: latest.current.pending };

  const handle = (y: number) => {
    const { min: mn, max: mx, step: st, h: ht } = latest.current;
    if (!ht) return;
    const ratio = Math.max(0, Math.min(1, 1 - y / ht)); // 底=mn 顶=mx
    const raw = mn + ratio * (mx - mn);
    const v = Math.round(raw / st) * st;
    latest.current.pending = v;
    setDrag(v);
  };

  const release = () => {
    const v = latest.current.pending;
    latest.current.pending = null;
    setDrag(null);
    if (v != null) latest.current.onChange(v);
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => handle(e.nativeEvent.locationY),
    onPanResponderMove: (e) => handle(e.nativeEvent.locationY),
    onPanResponderRelease: release,
    onPanResponderTerminate: release,
  }), []);

  const shown = drag ?? value;
  const ratio = max > min ? (shown - min) / (max - min) : 0.5;
  const r = Math.max(0, Math.min(1, ratio));
  const thumbY = (h ? (1 - r) * h : 0) - 2; // thumb 高 4，中心对齐
  const center = h / 2;
  // 从中点向 thumb 填充（拖动预览时按预览值填充）
  const fillTop = shown >= 0 ? thumbY + 4 : center;
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
      {IS_HD ? (
        <View style={{ position: 'absolute', bottom: -2, flexDirection: 'row', gap: 4 }}>
          <StepBtn d={-1} onPress={() => onChange(Math.max(min, Math.round((value - step) / step) * step))} />
          <StepBtn d={1} onPress={() => onChange(Math.min(max, Math.round((value + step) / step) * step))} />
        </View>
      ) : null}
    </View>
  );
}

const vs = StyleSheet.create({
  col: { width: '100%', alignItems: 'center' },
  rail: { position: 'absolute', top: 0, bottom: 0, left: '50%', marginLeft: -2, width: 4, borderRadius: 2, backgroundColor: C.stroke },
  zero: { position: 'absolute', top: '50%', marginTop: -0.5, left: 2, right: 2, height: 1, backgroundColor: C.strokeStrong },
  fill: { position: 'absolute', left: '50%', marginLeft: -2, width: 4, borderRadius: 2, backgroundColor: C.brand },
  thumb: { position: 'absolute', left: '50%', marginLeft: -9, width: 18, height: 4, borderRadius: 2, backgroundColor: C.brand, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 3, elevation: 3 },
});

// ---------- 卡片内滑杆块（#232323 r12：标签 + 值 + 横滑杆） ----------
function SRow({ label, valueLabel, value, min, max, step, onChange, disabled, style }: {
  label: string; valueLabel: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean; style?: object;
}) {
  if (IS_HD) {
    return (
      <View style={[{ opacity: disabled ? 0.4 : 1, paddingVertical: 4 }, style as never]}>
        <FxRow label={label} value={value} min={min} max={max} step={step}
          onChange={disabled ? () => {} : onChange}
          fmt={v => (label === '音调' ? v.toFixed(2) + 'x' : String(Math.round(v)))} />
      </View>
    );
  }
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
  const [aeqQuery, setAeqQuery] = useState(''); // lx52 AutoEq 型号搜索
  const [advancedOpen, setAdvancedOpen] = useState(false); // lx57 高级折叠

  useEffect(() => subscribeFx(() => force(x => x + 1)), []);

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
        <T onPress={() => nav.goBack()} hitSlop={6} style={{ width: 26 }}>
          <Icon name="back" size={20} />
        </T>
        <Text style={st.title}>均衡器与音效</Text>
        {/* 点按徽标：手动从服务器拉取音效配置（不再自动覆盖本地） */}
        <T
          style={st.syncBadge}
          hitSlop={8}
          activeOpacity={0.7}
          onPress={() => {
            fetchFxFromServer().then(() => {
              const s = fxSyncState();
              toast(s === 'synced' ? '已从服务器同步音效' : '未登录或服务器不可达，保持本地设置');
            });
          }}
        >
          <View style={[st.syncDot, sync === 'synced' && st.syncDotOn]} />
          <Text style={st.syncText}>{sync === 'synced' ? '已同步' : sync === 'local' ? '本地' : '同步中'}</Text>
        </T>
      </View>

      <ScrollView contentContainerStyle={[st.content, IS_HD && { maxWidth: 900, alignSelf: 'center', width: '100%' }]} showsVerticalScrollIndicator={false}>
        {/* ===== lx57: 听感模式(一键,普通用户唯一入口) ===== */}
        <View style={st.modeGrid}>
          {SOUND_MODES.filter(m => m.id !== 'custom').map(m => {
            const active = currentSoundMode() === m.id;
            return (
              <T key={m.id} activeOpacity={0.75} onPress={() => applySoundMode(m.id)} style={st.modeCell}>
                <View style={[st.modeCard, active && st.modeCardOn]}>
                  <Text style={[st.modeName, active && st.modeNameOn]}>{m.name}</Text>
                  <Text style={st.modeDesc} numberOfLines={1}>{m.desc}</Text>
                </View>
              </T>
            );
          })}
        </View>

        {/* ===== 高级调音(默认折叠) ===== */}
        <T activeOpacity={0.8} onPress={() => setAdvancedOpen(!advancedOpen)} style={st.advToggle}>
          <Text style={st.advToggleText}>高级调音 {advancedOpen ? '▾' : '▸'}</Text>
          <Text style={st.advHint}>均衡器/混响/音效细节</Text>
        </T>
        {advancedOpen && (<>
        {/* ===== 快速预设（横滚胶囊） ===== */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.presetScroll}>
          {allPresetNames.map(name => {
            const active = activePresetName === name;
            const isCustom = customPresets.some(p => p.name === name);
            return (
              <T
                key={name}
                style={[st.chip, active && st.chipOn]}
                activeOpacity={0.7}
                onPress={() => applyFxPreset(name)}
                onLongPress={isCustom ? () => setManagePreset(name) : undefined}
              >
                <Text style={[st.chipText, active && st.chipTextOn]}>{name}</Text>
              </T>
            );
          })}
          <T style={st.chipAdd} activeOpacity={0.7} onPress={() => { setInputVal(''); setPresetSheet({ mode: 'add' }); }}>
            <Text style={st.chipAddText}>＋</Text>
          </T>
        </ScrollView>

        {/* ===== 均衡器（垂直 10 段） ===== */}
        <View style={st.card}>
          <View style={st.cardHead}>
            <Text style={st.cardTitle}>均衡器</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {activePresetName ? <Text style={st.presetNameOn}>{activePresetName}</Text> : null}
              {eqTouched ? (
                <T onPress={resetEQ} hitSlop={4}>
                  <Text style={st.linkBtn}>重置</Text>
                </T>
              ) : null}
            </View>
          </View>
          {IS_HD ? (
            <View style={{ gap: 4 }}>
              {FX_FREQ_LABELS.map((label, i) => (
                <FxRow key={label} label={label} value={settings.eq[i]} min={-12} max={12} step={1} onChange={v => setEQ(i, v)} />
              ))}
            </View>
          ) : (
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
          )}
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
                <T
                  key={r.id}
                  style={[st.chip, st.revChip, on && st.chipOn]}
                  activeOpacity={0.7}
                  onPress={() => setReverb(r.id)}
                >
                  <Text style={[st.chipText, on && st.chipTextOn]} numberOfLines={1}>{r.name}</Text>
                </T>
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
              <T onPress={resetFxPitch} hitSlop={4}>
                <Text style={st.linkBtn}>重置</Text>
              </T>
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
            <T activeOpacity={0.7} onPress={() => setPanner({ enable: !settings.panner.enable })}>
              <View style={[st.switch, settings.panner.enable && st.switchOn]}>
                <View style={[st.knob, settings.panner.enable && st.knobOn]} />
              </View>
            </T>
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

        {/* ===== AutoEQ 耳机校正（lx52） ===== */}
        <View style={st.card}>
          <View style={st.cardHead}>
            <Text style={st.cardTitleAuto}>AutoEQ 耳机校正</Text>
            <T activeOpacity={0.7} onPress={() => setViper({ autoeqOn: !settings.viper.autoeqOn })} disabled={!settings.viper.autoeqName}>
              <View style={[st.switch, settings.viper.autoeqOn && settings.viper.autoeqName && st.switchOn]}>
                <View style={[st.knob, settings.viper.autoeqOn && settings.viper.autoeqName && st.knobOn]} />
              </View>
            </T>
          </View>
          <Text style={[st.cardHint, { marginBottom: 8 }]}>按耳机实测频响自动校正到哈曼目标曲线 · {AUTOEQ_MODELS.length} 个型号</Text>
          <TextInput
            style={st.aeqInput}
            placeholder="搜索耳机型号…"
            placeholderTextColor={C.text3}
            value={aeqQuery}
            onChangeText={setAeqQuery}
          />
          <ScrollView style={st.aeqList} nestedScrollEnabled>
            {AUTOEQ_MODELS.filter(m => !aeqQuery || m.toLowerCase().includes(aeqQuery.toLowerCase())).slice(0, 60).map(m => (
              <T key={m} activeOpacity={0.7} onPress={() => setViper({ autoeqName: m, autoeqOn: true })}>
                <View style={[st.aeqRow, settings.viper.autoeqName === m && st.aeqRowOn]}>
                  <Text style={[st.aeqRowText, settings.viper.autoeqName === m && { color: C.brand, fontWeight: '700' }]} numberOfLines={1}>{m}</Text>
                  {settings.viper.autoeqName === m ? (
                    <Text style={st.aeqMeta}>{autoeqProfile(m)?.f.length ?? 0} 段滤波</Text>
                  ) : null}
                </View>
              </T>
            ))}
          </ScrollView>
        </View>

        {/* ===== ViPER 效果（lx50） ===== */}
        <View style={st.card}>
          <View style={st.cardHead}>
            <Text style={st.cardTitle}>ViPER 音效<Text style={st.cardHint}>  低音/细节/声场/限幅</Text></Text>
          </View>
          {/* Fire Bass 模式胶囊(lx58:坑121 presetScroll 无 flexDirection:row——竖排堆叠观感'重叠'且挤出屏幕) */}
          <View style={st.chipRow}>
            {([0, 1, 2, 3] as const).map(m => (
              <T key={m} activeOpacity={0.7} onPress={() => setViper({ bassMode: m })}>
                <View style={[st.chip, settings.viper.bassMode === m && st.chipOn]}>
                  <Text style={[st.chipText, settings.viper.bassMode === m && st.chipTextOn]}>{['关闭', '自然低音', '纯净低音', '清澈人声'][m]}</Text>
                </View>
              </T>
            ))}
          </View>
          <SRow
            style={{ marginTop: 8, opacity: settings.viper.bassMode > 0 ? 1 : 0.4 }}
            label="低音强度" valueLabel={Math.round(settings.viper.bassLevel * 100) + '%'}
            value={settings.viper.bassLevel} min={0} max={1} step={0.05}
            onChange={v => setViper({ bassLevel: v })} disabled={settings.viper.bassMode === 0}
          />
          {/* DCV / Cure / Limiter 开关行 */}
          {([
            { k: 'dcvEnable', lv: 'dcvLevel', label: '动态细节（DCV）', tip: '小音量细节增强' },
            { k: 'cureEnable', lv: 'cureLevel', label: '声场矫正（Cure+）', tip: '耳机交叉馈送，建议用耳机' },
          ] as const).map(row => (
            <View key={row.k} style={[st.cardHead, { marginTop: 14 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.cardTitle}>{row.label}</Text>
                <Text style={st.cardHint}>{row.tip}</Text>
              </View>
              <T activeOpacity={0.7} onPress={() => setViper({ [row.k]: !settings.viper[row.k] } as Partial<FxViper>)}>
                <View style={[st.switch, settings.viper[row.k] && st.switchOn]}>
                  <View style={[st.knob, settings.viper[row.k] && st.knobOn]} />
                </View>
              </T>
            </View>
          ))}
          <SRow
            style={{ opacity: settings.viper.dcvEnable ? 1 : 0.4 }}
            label="细节强度" valueLabel={Math.round(settings.viper.dcvLevel * 100) + '%'}
            value={settings.viper.dcvLevel} min={0} max={1} step={0.05}
            onChange={v => setViper({ dcvLevel: v })} disabled={!settings.viper.dcvEnable}
          />
          <SRow
            style={{ marginTop: 8, opacity: settings.viper.cureEnable ? 1 : 0.4 }}
            label="交叉馈送量" valueLabel={Math.round(settings.viper.cureLevel * 100) + '%'}
            value={settings.viper.cureLevel} min={0} max={1} step={0.05}
            onChange={v => setViper({ cureLevel: v })} disabled={!settings.viper.cureEnable}
          />
          <View style={[st.cardHead, { marginTop: 14 }]}>
            <View style={{ flex: 1 }}>
              <Text style={st.cardTitle}>恒定限幅器</Text>
              <Text style={st.cardHint}>防多效果叠加爆音</Text>
            </View>
            <T activeOpacity={0.7} onPress={() => setViper({ limiterEnable: !settings.viper.limiterEnable })}>
              <View style={[st.switch, settings.viper.limiterEnable && st.switchOn]}>
                <View style={[st.knob, settings.viper.limiterEnable && st.knobOn]} />
              </View>
            </T>
          </View>
        </View>

        </>)}
        <Text style={st.syncCaption}>
          {sync === 'synced' ? '已与服务器同步（Web 播放器共享）· 点右上角徽标重新拉取' : sync === 'local' ? '本地模式：未登录，设置仅保存在本机 · 点右上角徽标从服务器拉取' : '同步中…'}
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
            <T
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
            </T>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 14, height: 32, borderRadius: 16, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: C.brand },
  chipText: { color: C.text2, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: C.onBrand, fontWeight: '800' },
  chipAdd: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: C.strokeStrong, alignItems: 'center', justifyContent: 'center' },
  chipAddText: { color: C.text3, fontSize: 15, fontWeight: '800', lineHeight: 17 },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  modeCell: { width: '31%', flexGrow: 0, flexShrink: 0 },
  modeCard: { borderRadius: 12, backgroundColor: C.surface2, paddingHorizontal: 6, paddingVertical: 10, alignItems: 'center', minHeight: 62, justifyContent: 'center' },
  modeCardOn: { backgroundColor: C.brand },
  modeName: { color: C.text, fontSize: 14, fontWeight: '700' },
  modeNameOn: { color: C.onBrand },
  modeDesc: { color: C.text3, fontSize: 10, marginTop: 2, textAlign: 'center' },
  advToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, marginBottom: 4 },
  advToggleText: { color: C.text2, fontSize: 14, fontWeight: '600' },
  advHint: { color: C.text3, fontSize: 11 },
  aeqInput: { height: 38, borderRadius: 10, backgroundColor: C.inset, color: C.text, fontSize: 13, paddingHorizontal: 12, marginBottom: 8 },
  aeqList: { maxHeight: 220, borderRadius: 12 },
  aeqRow: { flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.surface2, marginBottom: 4 },
  aeqRowOn: { backgroundColor: C.selTint },
  aeqRowText: { flex: 1, color: C.text, fontSize: 13 },
  aeqMeta: { color: C.text3, fontSize: 11 },

  // 卡片
  card: { backgroundColor: C.surface, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  cardTitleAuto: { flex: 1, color: C.text, fontSize: 14, fontWeight: '700' },
  cardTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  cardMeta: { color: C.brandText, fontSize: 11, fontWeight: '700', maxWidth: 120 },
  cardHint: { color: C.text3, fontSize: 11, fontWeight: '500' },
  linkBtn: { color: C.brandText, fontSize: 11, fontWeight: '800' },
  presetNameOn: { color: C.text2, fontSize: 11, fontWeight: '600' },

  // EQ 垂直网格
  eqGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  eqCol: { width: '9%', alignItems: 'center', gap: 6 },
  eqDb: { color: C.text3, fontSize: 9, fontWeight: '800', height: 12 },
  eqDbHot: { color: C.brandText },
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
  switch: { width: 44, height: 26, borderRadius: 13, backgroundColor: C.inset2, padding: 3 },
  switchOn: { backgroundColor: C.brand },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.knob },
  knobOn: { backgroundColor: '#FFFFFF', alignSelf: 'flex-end' },

  syncCaption: { color: C.text3, fontSize: 10, textAlign: 'center', marginTop: 2 },

  // sheet
  sheetInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  sheetInput: { flex: 1, backgroundColor: C.inset, borderRadius: 12, paddingHorizontal: 14, height: 44, color: C.text, fontSize: 15 },
  sheetInputOk: { backgroundColor: C.brand, borderRadius: 12, paddingHorizontal: 18, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetInputOkText: { color: C.onBrand, fontSize: 14, fontWeight: '800' },
});
