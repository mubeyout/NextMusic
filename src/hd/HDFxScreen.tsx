// HDFxScreen v3.20(老板:重构均衡器与音效页,适配 web/pc)
// 全宽 HD 布局(替代 withPhoneScale 的手机版):听感模式/EQ 10段竖推子+预设/混响/3D/变调/ViPER/AutoEQ
// 原生端(手机/TV)继续用 screens/FxScreen;本屏仅 web/桌面注册
import React, { useEffect, useRef, useState, useReducer } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C, H, SH, T } from './hdtokens';
import { HDTouch } from './HDTouch';
import { hdNav } from './hdnav';
import { toast } from '../components/Dialog';
import {
  subscribeFx, fxSnapshot, setEQ, resetEQ, applyFxPreset, setReverb, setReverbGain,
  setFxPitch, resetFxPitch, setPanner, setViper, applySoundMode, currentSoundMode,
  FX_FREQS, FX_FREQ_LABELS, FX_DEFAULT_PRESETS, FX_REVERB_OPTIONS,
  saveNewPreset, deleteCustomPreset, renameCustomPreset,
  AUTOEQ_MODELS, fxSyncState, fetchFxFromServer, type SoundMode, type FxSettings,
} from '../services/soundfx';

const IS_WEB = Platform.OS === 'web';

// ---------- 滑子(挤出无遮挡;RNW 鼠标拖拽走 responder) ----------
function VSlider({ value, min = -12, max = 12, onChange, height = 130 }: { value: number; min?: number; max?: number; onChange: (v: number) => void; height?: number }) {
  const trackRef = useRef<React.ComponentRef<typeof View> | null>(null); // v3.28:ref 实例类型(ComponentRef)
  const set = (pageY: number) => {
    const el = trackRef.current as unknown as HTMLElement | null;
    if (!el?.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (pageY - r.top) / r.height));
    onChange(Math.round((min + (1 - t) * (max - min)) * 2) / 2);
  };
  const zp = (0 - min) / (max - min);   // 零线位置(自底比例)
  const vp = (value - min) / (max - min); // 当前值位置
  return (
    <View style={vs.wrap}>
      <Text style={vs.val}>{value > 0 ? '+' : ''}{value}</Text>
      <View
        ref={trackRef}
        style={[vs.track, { height }]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={e => set(e.nativeEvent.pageY)}
        onResponderMove={e => set(e.nativeEvent.pageY)}
      >
        <View style={[vs.fill, { bottom: `${zp * 100}%`, height: `${Math.abs(vp - zp) * 100}%` }]} />
        <View style={[vs.zero, { bottom: `${zp * 100}%` }]} />
        <View style={[vs.knob, { bottom: `calc(${vp * 100}% - 2px)` }]} />
      </View>
    </View>
  );
}

function HSlider({ value, min = 0, max = 3, step = 0.1, onChange, label }: { value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; label: string }) {
  const trackRef = useRef<React.ComponentRef<typeof View> | null>(null); // v3.28:ref 实例类型(ComponentRef)
  const set = (pageX: number) => {
    const el = trackRef.current as unknown as HTMLElement | null;
    if (!el?.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (pageX - r.left) / r.width));
    const v = min + t * (max - min);
    onChange(Math.round(v / step) * step);
  };
  return (
    <View style={hs.wrap}>
      <Text style={hs.label}>{label}</Text>
      <View
        ref={trackRef}
        style={hs.track}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={e => set(e.nativeEvent.pageX)}
        onResponderMove={e => set(e.nativeEvent.pageX)}
      >
        <View style={[hs.fill, { flex: Math.max(0.001, (value - min) / (max - min)) }]} />
        <View style={{ flex: 1 }} />
      </View>
      <Text style={hs.val}>{(+value).toFixed(step < 1 ? 1 : 0)}</Text>
    </View>
  );
}

function Seg({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <View style={st.segRow}>
      {options.map(o => (
        <HDTouch key={o.key} style={[st.segItem, value === o.key && st.segItemOn]} hoverBg="#ffffff1a" onPress={() => onChange(o.key)}>
          <Text style={[st.segText, value === o.key && { color: '#0b0f0d', fontWeight: '700' }]}>{o.label}</Text>
        </HDTouch>
      ))}
    </View>
  );
}

// v3.34(老板:开关非标准):重做为标准开关——轨道+白色圆滑块平移,开=品牌绿/关=中性灰,web 下 transform 过渡动画
function Switch({ on }: { on: boolean }) {
  const knobRef = useRef<React.ComponentRef<typeof View> | null>(null);
  useEffect(() => {
    if (!IS_WEB) return;
    const el = knobRef.current as unknown as HTMLElement | null;
    if (el?.style) el.style.transition = 'transform .18s cubic-bezier(.4,0,.2,1)';
  }, []);
  return (
    <View style={[st.tgTrack, on && st.tgTrackOn]} pointerEvents="none">
      <View ref={knobRef} style={[st.tgKnob, on && st.tgKnobOn]} />
    </View>
  );
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <HDTouch style={st.tgRow} hoverBg={C.hover} onPress={() => onChange(!on)}>
      <Text style={st.tgLabel}>{label}</Text>
      <Switch on={on} />
    </HDTouch>
  );
}

function SectionTitle({ icon, title, desc }: { icon: string; title: string; desc?: string }) {
  return (
    <View style={st.secHead}>
      <Icon name={icon as never} size={15} color={C.brand} />
      <Text style={st.secTitle}>{title}</Text>
      {desc ? <Text style={st.secDesc}>{desc}</Text> : null}
    </View>
  );
}

// ---------- 主屏 ----------
export function HDFxScreen() {
  const insets = useSafeAreaInsets();
  const [, force] = useReducer(x => x + 1, 0);
  useEffect(() => subscribeFx(force), []);
  const snap = fxSnapshot();
  const s: FxSettings = snap.settings;
  const mode = currentSoundMode();
  const [eqPickOpen, setEqPickOpen] = useState(false); // AutoEQ 型号弹层

  const presets = [...FX_DEFAULT_PRESETS, ...snap.customPresets];

  return (
    <View style={st.screen}>
      {/* 页头:返回+标题居左(SKILL 约定) */}
      <View style={[st.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <HDTouch style={st.backBtn} hoverBg={C.hover} onPress={() => hdNav()?.goBack()}>
          <Icon name="back" size={16} color="#ffffffcc" />
          <Text style={st.backLabel}>返回</Text>
        </HDTouch>
        <Text style={st.headerTitle}>均衡器与音效</Text>
        <HDTouch style={st.syncBtn} hoverBg={C.hover} onPress={() => { fetchFxFromServer().then(() => toast('已从服务器拉取音效设置')); }}>
          <Icon name="refresh" size={12} color={fxSyncState() === 'synced' ? C.brand : C.text2} />
          <Text style={st.syncText}>{fxSyncState() === 'synced' ? '已同步' : fxSyncState() === 'local' ? '本地' : '拉取'}</Text>
        </HDTouch>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 26, paddingTop: 10, paddingBottom: 40 + H.playbar, gap: 20, width: '100%' }} showsVerticalScrollIndicator={false}>

        {/* ===== 听感模式 ===== */}
        <SectionTitle icon="wave" title="听感模式" desc="一键组合,手动改高级项自动回落自定义" />
        <View style={st.chipWrap}>
          {([
            { id: 'off', name: '原声' }, { id: 'bass', name: '重低音' }, { id: 'vocal', name: '人声' },
            { id: 'night', name: '夜听' }, { id: 'scene', name: '现场感' }, { id: 'custom', name: '自定义' },
          ] as { id: SoundMode; name: string }[]).map(m => (
            <HDTouch key={m.id} style={[st.chip, mode === m.id && st.chipOn]} hoverBg="#ffffff1a" onPress={() => { applySoundMode(m.id); force(); }}>
              <Text style={[st.chipText, mode === m.id && { color: '#0b0f0d', fontWeight: '700' }]}>{m.name}</Text>
            </HDTouch>
          ))}
        </View>

        {/* ===== EQ ===== */}
        <View>
          <SectionTitle icon="sliders" title="均衡器" desc="10 段 · ±12dB" />
          <View style={st.chipWrap}>
            {presets.map(p => (
              <HDTouch key={p.name} style={[st.chip, snap.activePresetName === p.name && st.chipOn]} hoverBg="#ffffff1a"
                onPress={() => { applyFxPreset(p.name); force(); }}
                onLongPress={IS_WEB && snap.customPresets.some(c => c.name === p.name) ? () => {
                  const nn = window.prompt('重命名预设(清空=删除)', p.name);
                  if (nn === null) return;
                  if (!nn.trim()) { deleteCustomPreset(p.name); toast('预设已删除'); }
                  else if (renameCustomPreset(p.name, nn)) toast('预设已重命名');
                  force();
                } : undefined}>
                <Text style={[st.chipText, snap.activePresetName === p.name && { color: '#0b0f0d', fontWeight: '700' }]}>{p.name}</Text>
              </HDTouch>
            ))}
            <HDTouch style={[st.chip, st.chipGhost]} hoverBg="#ffffff1a" onPress={() => {
              const n = window.prompt('保存当前 EQ 为预设', '我的预设');
              if (!n) return;
              const err = saveNewPreset(n);
              toast(err || `已保存「${n.trim()}」`); force();
            }}>
              <Icon name="add" size={12} color={C.text2} />
              <Text style={st.chipText}>存为预设</Text>
            </HDTouch>
          </View>
          <View style={st.eqRow}>
            {s.eq.map((g, i) => (
              <VSlider key={FX_FREQS[i]} value={g} onChange={v => { setEQ(i, v); force(); }} />
            ))}
          </View>
          <View style={st.eqLabels}>
            {FX_FREQ_LABELS.map(f => <Text key={f} style={st.eqLabel}>{f}</Text>)}
          </View>
          <HDTouch style={st.linkBtn} hoverBg={C.hover} onPress={() => { resetEQ(); force(); }}>
            <Text style={st.linkText}>均衡器归零</Text>
          </HDTouch>
        </View>

        {/* ===== 环境混响 ===== */}
        <View>
          <SectionTitle icon="podcast" title="环境混响" desc="19 种空间感" />
          <View style={st.chipWrap}>
            {FX_REVERB_OPTIONS.map(r => (
              <HDTouch key={r.id} style={[st.chip, s.reverb.id === r.id && st.chipOn]} hoverBg="#ffffff1a" onPress={() => { setReverb(r.id); force(); }}>
                <Text style={[st.chipText, s.reverb.id === r.id && { color: '#0b0f0d', fontWeight: '700' }]}>{r.name}</Text>
              </HDTouch>
            ))}
          </View>
          <HSlider label="干声" value={s.reverb.mainGain} min={0} max={3} onChange={v => { setReverbGain('main', v); force(); }} />
          <HSlider label="湿声" value={s.reverb.sendGain} min={0} max={3} onChange={v => { setReverbGain('send', v); force(); }} />
        </View>

        {/* ===== 3D 环绕 ===== */}
        <View>
          <SectionTitle icon="headphones" title="3D 立体环绕" />
          <Toggle on={s.panner.enable} label="启用环绕" onChange={v => { setPanner({ enable: v }); force(); }} />
          {s.panner.enable ? (
            <View style={{ gap: 8 }}>
              <HSlider label="速度" value={s.panner.speed} min={1} max={50} step={1} onChange={v => { setPanner({ speed: v }); force(); }} /> // v3.34:量纲修正(原 0.2-3 与存储 1-50 错位,默认 25 顶格+拖动跳整数)
              <HSlider label="距离" value={s.panner.distance} min={1} max={30} step={1} onChange={v => { setPanner({ distance: v }); force(); }} />
            </View>
          ) : null}
        </View>

        {/* ===== 音调 ===== */}
        <View>
          <SectionTitle icon="music" title="音调升降" desc={IS_WEB ? '原生 Sonic 变调;web 暂不支持(避免变速假变调)' : '0.5~2.0x'} />
          {IS_WEB ? (
            <Text style={st.muted}>手机/TV 端可用;web 播放器暂不实现变调(HTML5 Audio 变速会连带变速,不做假开关)。</Text>
          ) : null}
          <View style={st.stepperRow}>
            <HDTouch style={st.stepBtn} hoverBg={C.hover} disabled={IS_WEB} onPress={() => { setFxPitch(+(s.pitch - 0.05).toFixed(2)); force(); }}><Text style={st.stepText}>−</Text></HDTouch>
            <Text style={st.stepVal}>{s.pitch.toFixed(2)}x</Text>
            <HDTouch style={st.stepBtn} hoverBg={C.hover} disabled={IS_WEB} onPress={() => { setFxPitch(+(s.pitch + 0.05).toFixed(2)); force(); }}><Text style={st.stepText}>+</Text></HDTouch>
            <HDTouch style={st.linkBtn} hoverBg={C.hover} disabled={IS_WEB} onPress={() => { resetFxPitch(); force(); }}><Text style={st.linkText}>复位</Text></HDTouch>
          </View>
        </View>

        {/* ===== ViPER ===== */}
        <View style={{ gap: 10 }}>
          <SectionTitle icon="speaker" title="ViPER 音效" desc="低音/细节/矫正/限幅/响度" />
          <Seg
            options={[{ key: '0', label: '关闭' }, { key: '1', label: '自然低音' }, { key: '2', label: '纯净低音' }, { key: '3', label: '清澈人声' }]}
            value={String(s.viper.bassMode)}
            onChange={k => { setViper({ bassMode: Number(k) as 0 | 1 | 2 | 3 }); force(); }}
          />
          {s.viper.bassMode !== 0 ? <HSlider label="低音强度" value={s.viper.bassLevel} min={0} max={1} onChange={v => { setViper({ bassLevel: v }); force(); }} /> : null}
          <Toggle on={s.viper.dcvEnable} label="动态细节(DCV)" onChange={v => { setViper({ dcvEnable: v }); force(); }} />
          {s.viper.dcvEnable ? <HSlider label="细节强度" value={s.viper.dcvLevel} min={0} max={1} onChange={v => { setViper({ dcvLevel: v }); force(); }} /> : null}
          <Toggle on={s.viper.cureEnable} label="声场矫正(Cure)" onChange={v => { setViper({ cureEnable: v }); force(); }} />
          {s.viper.cureEnable ? <HSlider label="矫正强度" value={s.viper.cureLevel} min={0} max={1} onChange={v => { setViper({ cureLevel: v }); force(); }} /> : null}
          <Toggle on={s.viper.limiterEnable} label="恒定限幅(防破音)" onChange={v => { setViper({ limiterEnable: v }); force(); }} />
          <Toggle on={s.viper.loudnessEnable} label="响度补偿(小音量补低/高频)" onChange={v => { setViper({ loudnessEnable: v }); force(); }} />
        </View>

        {/* ===== AutoEQ ===== */}
        <View>
          <SectionTitle icon="headphones" title="AutoEQ 耳机校正" desc="57 型号实测参数" />
          <View style={st.aeRow}>
            <HDTouch style={[st.chip, st.chipWide]} hoverBg="#ffffff1a" onPress={() => setEqPickOpen(true)}>
              <Icon name="headphones" size={12} color={C.text2} />
              <Text style={st.chipText}>{s.viper.autoeqName || '选择耳机型号'}</Text>
            </HDTouch>
            <HDTouch style={st.aeSwitchHit} hoverBg="transparent" onPress={() => { setViper({ autoeqOn: !s.viper.autoeqOn }); force(); }}>
              <Switch on={!!s.viper.autoeqName && s.viper.autoeqOn} />
            </HDTouch> // v3.34:已启用/已停用文字 chip → 标准开关
          </View>
        </View>
      </ScrollView>

      {/* AutoEQ 型号弹层 */}
      {eqPickOpen ? <AutoeqPicker onClose={() => setEqPickOpen(false)} cur={s.viper.autoeqName} onPick={name => { setViper({ autoeqName: name, autoeqOn: !!name }); force(); setEqPickOpen(false); }} /> : null}
    </View>
  );
}

function AutoeqPicker({ onClose, cur, onPick }: { onClose: () => void; cur: string; onPick: (name: string) => void }) {
  const [q, setQ] = useState('');
  const list = AUTOEQ_MODELS.filter(m => !q || m.toLowerCase().includes(q.toLowerCase()));
  return (
    <View style={st.pickRoot}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <View style={st.pickPanel}>
        <View style={st.pickHead}>
          <Text style={st.pickTitle}>AutoEQ 耳机型号</Text>
          <HDTouch style={st.pickClose} hoverBg="#ffffff1a" onPress={onClose}><Icon name="close" size={15} color={C.text2} /></HDTouch>
        </View>
        <TextInput style={st.pickInput} placeholder="搜索型号…" placeholderTextColor={C.text3} value={q} onChangeText={setQ} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 4 }}>
          <HDTouch style={[st.pickRow, !cur && st.pickRowOn]} hoverBg={C.hover} onPress={() => onPick('')}>
            <Text style={[st.pickRowText, !cur && { color: C.brand, fontWeight: '700' }]}>不使用</Text>
          </HDTouch>
          {list.map(m => (
            <HDTouch key={m} style={[st.pickRow, cur === m && st.pickRowOn]} hoverBg={C.hover} onPress={() => onPick(m)}>
              <Text style={[st.pickRowText, cur === m && { color: C.brand, fontWeight: '700' }]}>{m}</Text>
            </HDTouch>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingBottom: 10 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, borderRadius: 9, paddingHorizontal: 10, backgroundColor: C.surface },
  backLabel: { color: '#ffffffcc', fontSize: H.font.sm },
  headerTitle: { flex: 1, color: C.text, fontSize: 17, fontWeight: '800' },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, borderRadius: 15, paddingHorizontal: 12, backgroundColor: C.surface },
  syncText: { color: C.text2, fontSize: H.font.xs },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secTitle: { color: C.text, fontSize: H.font.md, fontWeight: '800' },
  secDesc: { color: C.text3, fontSize: H.font.xs, flex: 1, textAlign: 'right' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  chip: { height: 30, borderRadius: 15, paddingHorizontal: 13, borderWidth: 1, borderColor: '#ffffff26', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  chipOn: { backgroundColor: C.brand, borderColor: C.brand },
  chipGhost: { borderStyle: 'dashed' as const },
  chipWide: { flex: 1, justifyContent: 'flex-start' },
  chipText: { color: '#ffffffcc', fontSize: H.font.sm },
  eqRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 2 },
  eqLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 6 },
  eqLabel: { color: C.text3, fontSize: 8, fontWeight: '600', width: 26, textAlign: 'center' },
  linkBtn: { alignSelf: 'flex-start', height: 28, borderRadius: 14, paddingHorizontal: 12, borderWidth: 1, borderColor: '#ffffff26', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  linkText: { color: C.text2, fontSize: H.font.xs },
  muted: { color: C.text3, fontSize: H.font.xs, lineHeight: 16 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  stepBtn: { width: 34, height: 30, borderRadius: 9, backgroundColor: C.elev, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: C.text, fontSize: 15, fontWeight: '700' },
  stepVal: { color: C.text, fontSize: H.font.md, fontVariant: ['tabular-nums'], minWidth: 52, textAlign: 'center', fontWeight: '700' },
  tgRow: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 10, paddingHorizontal: 12, backgroundColor: C.surface, marginTop: 6 },
  tgLabel: { flex: 1, color: C.text, fontSize: H.font.sm, fontWeight: '600' },
  tgTrack: { width: 40, height: 22, borderRadius: 11, backgroundColor: T.light ? '#1F232922' : '#ffffff22', borderWidth: 1, borderColor: T.light ? '#1F232930' : '#ffffff30', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 }, // v3.34:标准开关轨道
  tgTrackOn: { backgroundColor: C.brand, borderColor: C.brand },
  tgKnob: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  tgKnobOn: { transform: [{ translateX: 20 }] }, // 40-16-2-2=20
  aeSwitchHit: { height: 34, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  segRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  segItem: { height: 30, borderRadius: 15, paddingHorizontal: 14, borderWidth: 1, borderColor: '#ffffff26', alignItems: 'center', justifyContent: 'center' },
  segItemOn: { backgroundColor: C.brand, borderColor: C.brand },
  segText: { color: '#ffffffcc', fontSize: H.font.sm },
  aeRow: { flexDirection: 'row', gap: 7, marginTop: 8, alignItems: 'center' },
  pickRoot: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, backgroundColor: '#000000CC', alignItems: 'center', justifyContent: 'center' }, // v3.28:absoluteFillObject 已从 RN 类型移除,内联
  pickPanel: { width: '84%', maxWidth: 560, height: '76%', backgroundColor: '#17191E', borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, overflow: 'hidden' },
  pickHead: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  pickTitle: { flex: 1, color: C.text, fontSize: H.font.md, fontWeight: '800' },
  pickClose: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pickInput: { margin: 12, height: 34, borderRadius: 9, backgroundColor: '#ffffff0d', paddingHorizontal: 12, color: C.text, fontSize: H.font.sm },
  pickRow: { height: 36, borderRadius: 9, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: '#ffffff08' },
  pickRowOn: { backgroundColor: C.hover },
  pickRowText: { color: '#ffffffcc', fontSize: H.font.sm },
});

// VSlider 内部样式(绝对定位百分比:fill 自零线向值延伸,knob 跟值,零线常驻)
const vs = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 5 },
  val: { color: C.text2, fontSize: 8, fontVariant: ['tabular-nums'], minWidth: 26, textAlign: 'center' },
  track: { width: 22, borderRadius: 11, backgroundColor: '#ffffff0f', overflow: 'hidden' },
  fill: { position: 'absolute', left: 3, right: 3, backgroundColor: C.brand, borderRadius: 3 },
  zero: { position: 'absolute', left: 3, right: 3, height: 1, backgroundColor: '#ffffff30' },
  knob: { position: 'absolute', left: 3, right: 3, height: 5, borderRadius: 3, backgroundColor: '#ffffffee' },
});
const hs = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 34 },
  label: { color: C.text2, fontSize: H.font.sm, width: 64 },
  track: { flex: 1, height: 22, borderRadius: 11, backgroundColor: '#ffffff0f', padding: 3, flexDirection: 'row', overflow: 'hidden' },
  fill: { backgroundColor: C.brand, borderRadius: 8 },
  val: { color: C.text, fontSize: H.font.sm, fontVariant: ['tabular-nums'], width: 36, textAlign: 'right' },
});
