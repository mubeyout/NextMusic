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

// 对齐 lxserver「均衡器与音效调节」：
// 环境混响音效(14 选 + DRY/WET) · 音调升降(0.5~2.0x) · 3D 立体环绕(速度/距离) · 均衡器(10 段 ±12dB) · 快速预设

// ---------- 横向滑杆（PanResponder，免第三方依赖；结构与 Web range 对齐：左起填充） ----------
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
  trackDisabled: { opacity: 0.45 },
  rail: { position: 'absolute', left: 0, right: 0, top: 11, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF1C' },
  fill: { position: 'absolute', left: 0, top: 11, height: 6, borderRadius: 3, backgroundColor: C.brand },
  thumb: { position: 'absolute', top: 7, width: 14, height: 14, borderRadius: 7, backgroundColor: C.brand, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, elevation: 3 },
});

function SliderRow({ label, valueLabel, value, min, max, step, onChange, disabled, reset }: {
  label: string; valueLabel: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; disabled?: boolean; reset?: () => void;
}) {
  return (
    <View style={st.sliderRow}>
      <View style={st.sliderHead}>
        <Text style={st.sliderLabel}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={st.sliderValue}>{valueLabel}</Text>
          {reset ? (
            <TouchableOpacity onPress={reset} hitSlop={4}>
              <Text style={st.resetBtn}>重置</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <HSlider value={value} min={min} max={max} step={step} onChange={onChange} disabled={disabled} style={{ flex: 1 }} />
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

  return (
    <View style={[st.screen, { paddingTop: insets.top + 28 }]}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={6} style={{ width: 22 }}>
          <Icon name="back" size={22} />
        </TouchableOpacity>
        <Text style={st.title}>均衡器与音效调节</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* ===== 环境混响音效 ===== */}
        <Text style={st.section}>环境混响音效</Text>
        <View style={st.card}>
          <View style={st.reverbGrid}>
            {FX_REVERB_OPTIONS.map(r => {
              const on = settings.reverb.id === r.id;
              return (
                <TouchableOpacity key={r.id} style={st.reverbItem} activeOpacity={0.7} onPress={() => setReverb(r.id)}>
                  <View style={[st.radio, on && st.radioOn]}>
                    {on ? <View style={st.radioDot} /> : null}
                  </View>
                  <Text style={[st.reverbName, on && st.reverbNameOn]} numberOfLines={1}>{r.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.stroke, marginVertical: 14 }} />
          <SliderRow
            label="原始音量增益 (DRY)" valueLabel={Math.round(settings.reverb.mainGain * 100) + '%'}
            value={settings.reverb.mainGain * 100} min={0} max={300} step={5}
            onChange={v => setReverbGain('main', v / 100)} disabled={revDisabled}
          />
          <SliderRow
            label="环境音效增益 (WET)" valueLabel={Math.round(settings.reverb.sendGain * 100) + '%'}
            value={settings.reverb.sendGain * 100} min={0} max={300} step={5}
            onChange={v => setReverbGain('send', v / 100)} disabled={revDisabled}
          />
        </View>

        {/* ===== 音调升降 ===== */}
        <Text style={st.section}>音调升降调节</Text>
        <View style={st.card}>
          <SliderRow
            label="音调" valueLabel={settings.pitch.toFixed(2) + 'x'}
            value={settings.pitch} min={0.5} max={2} step={0.01}
            onChange={setFxPitch} reset={resetFxPitch}
          />
        </View>

        {/* ===== 3D 立体环绕 ===== */}
        <Text style={st.section}>3D 立体环绕 <Text style={st.sectionHint}>(需使用耳机)</Text></Text>
        <View style={st.card}>
          <View style={st.toggleRow}>
            <Text style={st.sliderLabel}>启用</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setPanner({ enable: !settings.panner.enable })}>
              <View style={[st.switch, settings.panner.enable && st.switchOn]}>
                <View style={[st.knob, settings.panner.enable && st.knobOn]} />
              </View>
            </TouchableOpacity>
          </View>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.stroke, marginVertical: 10 }} />
          <SliderRow
            label="环绕速度" valueLabel={String(settings.panner.speed)}
            value={settings.panner.speed} min={1} max={50} step={1}
            onChange={v => setPanner({ speed: v })} disabled={!settings.panner.enable}
          />
          <SliderRow
            label="声音距离" valueLabel={String(settings.panner.distance)}
            value={settings.panner.distance} min={1} max={30} step={1}
            onChange={v => setPanner({ distance: v })} disabled={!settings.panner.enable}
          />
        </View>

        {/* ===== 均衡器 ===== */}
        <View style={st.eqHeaderRow}>
          <Text style={st.section}>均衡器调节</Text>
          <TouchableOpacity onPress={resetEQ} hitSlop={4}>
            <Text style={st.resetBtn}>重置</Text>
          </TouchableOpacity>
        </View>
        <View style={st.card}>
          {FX_FREQ_LABELS.map((label, i) => (
            <View key={label} style={st.eqRow}>
              <Text style={st.eqFreq}>{label}</Text>
              <HSlider
                value={settings.eq[i]} min={-12} max={12} step={1}
                onChange={v => setEQ(i, v)}
                style={{ flex: 1 }}
              />
              <Text style={[st.eqDb, settings.eq[i] > 0 && st.eqDbHot, settings.eq[i] < 0 && st.eqDbLow]}>
                {settings.eq[i] > 0 ? '+' : ''}{settings.eq[i]}db
              </Text>
            </View>
          ))}
        </View>

        {/* ===== 快速预设 ===== */}
        <Text style={st.section}>快速预设</Text>
        <View style={st.pillsWrap}>
          {allPresetNames.map(name => {
            const active = activePresetName === name;
            const isCustom = customPresets.some(p => p.name === name);
            return (
              <TouchableOpacity
                key={name}
                style={[st.pill, active && st.pillActive]}
                activeOpacity={0.7}
                onPress={() => applyFxPreset(name)}
                onLongPress={isCustom ? () => setManagePreset(name) : undefined}
              >
                <Text style={[st.pillText, active && st.pillTextActive]}>{name}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={st.pillAdd} activeOpacity={0.7} onPress={() => { setInputVal(''); setPresetSheet({ mode: 'add' }); }}>
            <Text style={st.pillAddText}>＋</Text>
          </TouchableOpacity>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  title: { color: C.text, fontSize: 17, fontWeight: '800' },
  section: { color: C.text2, fontSize: 11, fontWeight: '900', letterSpacing: 1.5, textTransform: 'uppercase', marginVertical: 10 },
  sectionHint: { color: C.text3, fontWeight: '600', letterSpacing: 0 },
  eqHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },

  card: { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 4 },

  // 混响
  reverbGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  reverbItem: { flexDirection: 'row', alignItems: 'center', width: '25%', paddingVertical: 7 },
  radio: { width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, borderColor: '#FFFFFF33', marginRight: 6, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.brand, backgroundColor: C.brand },
  radioDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#04140A' },
  reverbName: { color: C.text2, fontSize: 11, fontWeight: '700' },
  reverbNameOn: { color: C.text },

  // 滑杆行
  sliderRow: { paddingVertical: 6 },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderLabel: { color: C.text2, fontSize: 11, fontWeight: '700' },
  sliderValue: { color: C.text, fontSize: 12, fontWeight: '800', minWidth: 44, textAlign: 'right' },
  resetBtn: { color: C.text3, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', backgroundColor: '#FFFFFF0F', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },

  // 3D
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  switch: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF22', padding: 3 },
  switchOn: { backgroundColor: C.brand },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  knobOn: { alignSelf: 'flex-end' },

  // EQ
  eqRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  eqFreq: { color: C.text2, fontSize: 11, fontWeight: '800', width: 34, textAlign: 'right' },
  eqDb: { color: C.brand, fontSize: 11, fontWeight: '800', width: 44, textAlign: 'right' },
  eqDbHot: { color: C.brand },
  eqDbLow: { color: C.brandSoft },

  // 预设
  pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: C.stroke, backgroundColor: C.surface },
  pillActive: { backgroundColor: C.brand, borderColor: C.brand },
  pillText: { color: C.text2, fontSize: 11, fontWeight: '800' },
  pillTextActive: { color: C.onBrand },
  pillAdd: { width: 34, height: 31, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#FFFFFF33', alignItems: 'center', justifyContent: 'center' },
  pillAddText: { color: C.text3, fontSize: 15, fontWeight: '800', lineHeight: 18 },

  syncCaption: { color: C.text3, fontSize: 10, textAlign: 'center', marginTop: 2 },

  // sheet
  sheetInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  sheetInput: { flex: 1, backgroundColor: '#FFFFFF0F', borderRadius: 12, paddingHorizontal: 14, height: 44, color: C.text, fontSize: 15 },
  sheetInputOk: { backgroundColor: C.brand, borderRadius: 12, paddingHorizontal: 18, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetInputOkText: { color: C.onBrand, fontSize: 14, fontWeight: '800' },
});
