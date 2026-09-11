// 均衡器与音效 —— 完整对齐 lxserver Web 播放器 sound-effects.js 的设计与数据结构：
//  - 10 段 EQ + 9 内置预设 + 自定义预设（增/删/重命名）
//  - 环境混响 14 种 + DRY/WET 增益
//  - 音调升降 0.5~2.0x（原生 Sonic）
//  - 3D 立体环绕（速度/距离）
//  - 设置经 /api/user/sound-effects 与服务器同步（Web 播放器 ↔ App 共享）
// 持久化：MMKV nextmusic-fx，key=lx_sound_effects（与 lxserver localStorage 同构）
import { NativeModules } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import { req, store } from './server';
// lx52 AutoEq 耳机校正库(57 型号,源自 jaakkopasanen/AutoEq 实测参数化,17KB)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const autoeqPack = require('../assets/autoeq_pack.json') as unknown as Record<string, AutoeqProfile>;

export interface FxPanner { enable: boolean; speed: number; distance: number }
export interface FxReverb { id: string; mainGain: number; sendGain: number }
// lx50 ViPER 招牌效果链
export interface FxViper {
  bassMode: 0 | 1 | 2 | 3;   // 0关 1自然低音 2纯净低音 3清澈人声
  bassLevel: number;        // 0~1
  dcvEnable: boolean; dcvLevel: number;    // 动态细节
  cureEnable: boolean; cureLevel: number;  // 耳机声场矫正
  limiterEnable: boolean;                 // 恒定限幅
  autoeqName: string;       // lx52 AutoEQ 耳机型号('' = 关)
  autoeqOn: boolean;        // 启用开关(选了型号但可临时关)
  loudnessEnable: boolean;  // lx53 响度补偿(小音量自动补低/高频)
}
export type AutoeqFilter = [type: 'lowshelf' | 'highshelf' | 'peaking', fc: number, gain: number, q: number];
export interface AutoeqProfile { preamp: number; f: AutoeqFilter[] }
export interface FxSettings { eq: number[]; pitch: number; panner: FxPanner; reverb: FxReverb; viper: FxViper }
export interface FxPreset { name: string; values: number[] }

export const FX_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const FX_FREQ_LABELS = FX_FREQS.map(f => (f >= 1000 ? f / 1000 + 'k' : String(f)));

// 与 lxserver defaultPresets 完全一致
export const FX_DEFAULT_PRESETS: FxPreset[] = [
  // lx57 移动端重调:31/62Hz 手机/耳机发不出(旧预设数学上听不出,坑=EQ"无效"根因);低频主力移 125Hz,增益收敛防爆音
  { name: '流行', values: [2, 4, 4, -1, 2, 3, -1, 0, 2, 2] },
  { name: '舞曲', values: [2, 4, 5, 0, -1, 1, 2, 3, 3, 2] },
  { name: '摇滚', values: [3, 4, 3, 1, -1, -1, 2, 2, 3, 3] },
  { name: '古典', values: [2, 3, 2, 2, 0, 1, -1, -2, -2, -3] },
  { name: '人声', values: [-3, -2, 0, 2, 4, 4, 3, 2, 0, -1] },
  { name: '慢歌', values: [1, 3, 3, 1, -1, 1, 2, 3, 3, 2] },
  { name: '电子乐', values: [3, 5, 4, -1, -2, 1, 3, 4, 4, 3] },
  { name: '重低音', values: [4, 6, 6, 2, 0, 0, 0, 0, 1, 2] },
  { name: '柔和', values: [-3, -2, -1, 0, 2, 2, 2, 2, 1, 0] },
];

// 与 lxserver reverbOptions 完全一致（id/名称/main/send）
export const FX_REVERB_OPTIONS: { id: string; name: string; main: number; send: number }[] = [
  { id: 'none', name: '关闭', main: 1.0, send: 0 },
  { id: 'telephone', name: '电话', main: 0.0, send: 3.0 },
  { id: 'church', name: '教堂', main: 1.8, send: 0.9 },
  { id: 'hall', name: '大厅', main: 0.8, send: 2.4 },
  { id: 'cinema', name: '电影院', main: 0.6, send: 2.3 },
  { id: 'dining', name: '餐厅', main: 0.6, send: 1.8 },
  { id: 'living', name: '卫生间', main: 1.6, send: 2.1 },
  { id: 'spreader', name: '室内', main: 1.0, send: 2.5 },
  { id: 'stereo', name: '立体声', main: 1.8, send: 0.6 },
  { id: 'matrix1', name: '矩阵混响 (1)', main: 1.5, send: 0.9 },
  { id: 'matrix2', name: '矩阵混响 (2)', main: 1.3, send: 1.0 },
  { id: 'cardiod', name: '心形扩散', main: 1.8, send: 0.6 },
  { id: 'magnetic', name: '磁性立体声', main: 1.0, send: 0.2 },
  { id: 'spring', name: '反馈弹簧', main: 1.8, send: 0.8 },
  // lx51:KuGou-viper IR 包(Ssssakurrra)
  { id: 'v_clear', name: '清澈增强', main: 1.6, send: 0.4 },
  { id: 'v_creek', name: '石涧树林', main: 1.0, send: 1.2 },
  { id: 'v_resound2', name: '立体声增强', main: 1.8, send: 0.5 },
  { id: 'v_surround', name: '立体声环绕', main: 1.8, send: 0.6 },
  { id: 'v_valley', name: '山谷宽场', main: 0.9, send: 1.6 },
  { id: 'v_presence', name: '临场感', main: 1.2, send: 0.9 },
];

const kv = createMMKV({ id: 'nextmusic-fx' });
const KEY = 'lx_sound_effects';

function defaultSettings(): FxSettings {
  return {
    eq: Array(10).fill(0),
    pitch: 1.0,
    panner: { enable: false, speed: 25, distance: 5 },
    reverb: { id: 'none', mainGain: 1.0, sendGain: 0 },
    viper: { bassMode: 0, bassLevel: 0.5, dcvEnable: false, dcvLevel: 0.5, cureEnable: false, cureLevel: 0.5, limiterEnable: false, autoeqName: '', autoeqOn: false, loudnessEnable: false },
  };
}

function sanitize(v: unknown): FxSettings {
  const d = defaultSettings();
  if (!v || typeof v !== 'object') return d;
  const s = v as Partial<FxSettings>;
  const out = d;
  if (Array.isArray(s.eq) && s.eq.length === 10) out.eq = s.eq.map(x => Math.max(-12, Math.min(12, Math.round(Number(x) || 0))));
  if (typeof s.pitch === 'number') out.pitch = Math.max(0.5, Math.min(2, s.pitch));
  if (s.panner) {
    out.panner = {
      enable: !!s.panner.enable,
      speed: clampInt(s.panner.speed, 1, 50, 25),
      distance: clampInt(s.panner.distance, 1, 30, 5),
    };
  }
  if (s.reverb) {
    const known = FX_REVERB_OPTIONS.some(r => r.id === s.reverb!.id);
    // 注意：Number(x) || 1 会把合法的 0（如电话混响 DRY=0）当 falsy 吞掉，必须用 isFinite 判有效
    const mg = Number(s.reverb.mainGain);
    const sg = Number(s.reverb.sendGain);    out.reverb = {
      id: known ? s.reverb.id! : 'none',
      mainGain: Number.isFinite(mg) ? Math.max(0, Math.min(3, mg)) : 1,
      sendGain: Number.isFinite(sg) ? Math.max(0, Math.min(3, sg)) : 0,
    };
  }
  if (s.viper) {
    const bl = Number(s.viper.bassLevel);
    const dl = Number(s.viper.dcvLevel);
    const cl = Number(s.viper.cureLevel);
    out.viper = {
      bassMode: (clampInt(s.viper.bassMode, 0, 3, 0)) as 0 | 1 | 2 | 3,
      bassLevel: Number.isFinite(bl) ? Math.max(0, Math.min(1, bl)) : 0.5,
      dcvEnable: !!s.viper.dcvEnable,
      dcvLevel: Number.isFinite(dl) ? Math.max(0, Math.min(1, dl)) : 0.5,
      cureEnable: !!s.viper.cureEnable,
      cureLevel: Number.isFinite(cl) ? Math.max(0, Math.min(1, cl)) : 0.5,
      limiterEnable: !!s.viper.limiterEnable,
      autoeqName: typeof s.viper.autoeqName === 'string' ? s.viper.autoeqName : '',
      autoeqOn: !!s.viper.autoeqOn,
      loudnessEnable: !!s.viper.loudnessEnable,
    };
  }
  return out;
}

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}

function loadCustom(): FxPreset[] {
  try {
    const raw = kv.getString(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { customPresets?: FxPreset[] };
    return (parsed.customPresets || []).filter(p => p && p.name && Array.isArray(p.values) && p.values.length === 10);
  } catch { return []; }
}

// ---------- 状态（订阅模式，同 downloads/library 惯例） ----------
let settings: FxSettings = sanitize(undefined);
let customPresets: FxPreset[] = [];
let activePresetName = '';
let loaded = false;
const subs = new Set<() => void>();

export function subscribeFx(fn: () => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function fxSnapshot() {
  return { settings, customPresets, activePresetName };
}

function notify() { subs.forEach(f => f()); }

function persist() {
  kv.set(KEY, JSON.stringify({ settings, customPresets }));
}

// ---------- 原生生效 ----------
function applyNative() {
  // web(Electron+纯浏览器): shim 已实现完整 WebAudio DSP 链(EQ/混响/声像/ViPER/变调),
  // 经 globalThis.__nmFxSet 注入——原实现漏了这条分支,web 上开音效无任何效果
  try {
    const fxSet = (globalThis as unknown as { __nmFxSet?: (cfg: Record<string, unknown>) => void }).__nmFxSet;
    if (fxSet) {
      fxSet({
        eq: settings.eq,
        reverb: { id: settings.reverb.id, mainGain: settings.reverb.mainGain, sendGain: settings.reverb.sendGain },
        panner: { enable: settings.panner.enable, speed: settings.panner.speed, distance: settings.panner.distance },
        viper: settings.viper,
        pitch: settings.pitch,
      });
      return; // web 路径已应用,无需原生
    }
  } catch { /* ignore */ }
  try {
    // lx55 救砖:原生 setConfig 任何异常(坏配置/旧原生/桥错误)都不许杀 App——音效失效可接受,启动循环闪退不可接受
    NativeModules.SoundFx?.setConfig({
      eq: settings.eq,
      reverb: { id: settings.reverb.id, mainGain: settings.reverb.mainGain, sendGain: settings.reverb.sendGain },
      panner: { enable: settings.panner.enable, speed: settings.panner.speed, distance: settings.panner.distance },
      viper: {
        bassMode: settings.viper.bassMode, bassLevel: settings.viper.bassLevel,
        dcvEnable: settings.viper.dcvEnable, dcvLevel: settings.viper.dcvLevel,
        cureEnable: settings.viper.cureEnable, cureLevel: settings.viper.cureLevel,
        limiterEnable: settings.viper.limiterEnable,
        loudnessEnable: settings.viper.loudnessEnable,
        autoeq: settings.viper.autoeqOn && settings.viper.autoeqName
          ? (autoeqProfile(settings.viper.autoeqName)?.f ?? []).map(f => [f[0], f[1], f[2], f[3]] as (string | number)[])
          : [],
        autoeqPreamp: settings.viper.autoeqOn ? (autoeqProfile(settings.viper.autoeqName)?.preamp ?? 0) : 0,
      },
    });
  } catch { /* 原生模块缺失时静默 */ }
  try {
    NativeModules.AudioPro?.setPlaybackPitch?.(settings.pitch);
  } catch { /* 旧版 audio-pro 无此方法 */ }
}

// ---------- 服务器同步（登录后与 lxserver Web 播放器共享） ----------
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let syncState: 'off' | 'synced' | 'local' = 'off';

function pushToServerSoon() {
  if (!store.token) { syncState = 'local'; notify(); return; }
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    req('/api/user/sound-effects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings, customPresets }),
    }).then(() => { syncState = 'synced'; notify(); }).catch(() => { syncState = 'local'; notify(); });
  }, 1500);
}

export async function fetchFxFromServer() {
  if (!store.token) { syncState = 'local'; notify(); return; }
  try {
    const d = (await req('/api/user/sound-effects')) as { settings?: unknown; customPresets?: FxPreset[] } | '';
    if (d && typeof d === 'object' && d.settings) {
      settings = sanitize(d.settings);
      customPresets = Array.isArray(d.customPresets) ? d.customPresets.filter(p => p?.name && p?.values?.length === 10) : [];
      activePresetName = '';
      persist(); applyNative(); syncState = 'synced'; notify();
    } else {
      syncState = 'synced';
    }
  } catch { syncState = 'local'; }
  notify();
}

export function fxSyncState() { return syncState; }

// ---------- 初始化（App 启动调用；也清掉旧版 5 段假数据） ----------
export function initFx() {
  if (loaded) return;
  loaded = true;
  // 清理旧版占位键（enabled/gains/preset）
  ['enabled', 'gains', 'preset'].forEach(k => kv.remove(k));
  const raw = kv.getString(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { settings?: unknown; customPresets?: FxPreset[] };
      settings = sanitize(parsed.settings);
      customPresets = (parsed.customPresets || []).filter(p => p?.name && p?.values?.length === 10);
    } catch { /* 保持默认 */ }
  }
  applyNative();
  // 2026-09 需求：不再启动时自动拉服务器音效（会覆盖本地，出现“一来就很大”）；
  // 同步改为 FX 页手动触发（徽标点按）。
}

// ---------- 管理操作（对齐 lxserver soundEffects manager API） ----------
function commit(next: FxSettings) {
  settings = next;
  persist(); applyNative(); pushToServerSoon(); notify();
}

/** lx57:高级项手动变更 → 模式回落"自定义"(听感模式与手动调节互斥,治"冲突不生效"的感知) */
function markCustom() { soundMode = 'custom'; }

export function setEQ(index: number, val: number) {
  markCustom();
  const eq = [...settings.eq];
  eq[index] = Math.max(-12, Math.min(12, Math.round(val)));
  activePresetName = '';
  commit({ ...settings, eq });
}

export function resetEQ() {
  activePresetName = '';
  commit({ ...settings, eq: Array(10).fill(0) });
}

export function applyFxPreset(name: string) {
  const all = [...FX_DEFAULT_PRESETS, ...customPresets];
  const p = all.find(x => x.name === name);
  if (!p) return false;
  activePresetName = name;
  commit({ ...settings, eq: [...p.values] });
  return true;
}

export function setReverb(id: string) {
  markCustom();
  const r = FX_REVERB_OPTIONS.find(x => x.id === id);
  if (!r) return;
  commit({ ...settings, reverb: { id: r.id, mainGain: r.main, sendGain: r.send } });
}

export function setReverbGain(type: 'main' | 'send', val: number) {
  markCustom();
  const v = Math.max(0, Math.min(3, val));
  const reverb = type === 'main'
    ? { ...settings.reverb, mainGain: v }
    : { ...settings.reverb, sendGain: v };
  commit({ ...settings, reverb });
}

export function setFxPitch(v: number) {
  const pitch = Math.max(0.5, Math.min(2, Math.round(v * 100) / 100));
  commit({ ...settings, pitch });
}

export function resetFxPitch() { setFxPitch(1.0); }

export function setPanner(patch: Partial<FxPanner>) {
  markCustom();
  commit({ ...settings, panner: { ...settings.panner, ...patch } });
}

// lx50: ViPER 链设样
export function setViper(patch: Partial<FxViper>) {
  markCustom();
  commit({ ...settings, viper: { ...settings.viper, ...patch } });
}

// lx57: 听感模式——一键组合全部音效参数;手动改任何高级项=自动回落"自定义"
export type SoundMode = 'custom' | 'off' | 'bass' | 'vocal' | 'night' | 'scene';
export const SOUND_MODES: { id: SoundMode; name: string; desc: string }[] = [
  { id: 'off', name: '原声', desc: '不加工，原始输出' },
  { id: 'bass', name: '重低音', desc: '低音增强+响度补偿' },
  { id: 'vocal', name: '人声', desc: '人声突出+细节增强' },
  { id: 'night', name: '夜听', desc: '小音量优化，柔和耐听' },
  { id: 'scene', name: '现场感', desc: '临场混响+立体声展宽' },
  { id: 'custom', name: '自定义', desc: '手动调节高级参数' },
];
let soundMode: SoundMode = 'custom';
export function currentSoundMode() { return soundMode; }

/** 一键应用:组合 EQ(移动端重调)/响度/ViPER/混响;AutoEq 耳机校正独立保留(不参与模式互斥) */
export function applySoundMode(mode: SoundMode) {
  soundMode = mode;
  const eq = (a: number[]) => a.map(x => Math.max(-12, Math.min(12, x)));
  switch (mode) {
    case 'off':
      activePresetName = '';
      commit({ ...settings, eq: eq(Array(10).fill(0)), reverb: { ...settings.reverb, id: 'none' },
        viper: { ...settings.viper, bassMode: 0, dcvEnable: false, cureEnable: false, limiterEnable: false, loudnessEnable: false } });
      break;
    case 'bass': // 移动端低音:中心 125Hz(手机/耳机发得出),配合 ViPER 纯净低音+限幅防爆
      activePresetName = '重低音';
      commit({ ...settings, eq: eq([5, 7, 6, 2, 0, 0, 0, 0, 1, 2]),
        viper: { ...settings.viper, bassMode: 2, bassLevel: 0.5, loudnessEnable: true, limiterEnable: true, dcvEnable: false, cureEnable: false } });
      break;
    case 'vocal': // 人声:250-2k 提,低频让位,清澈模式谐波增亮
      activePresetName = '人声';
      commit({ ...settings, eq: eq([-3, -2, 0, 3, 5, 5, 3, 1, 0, -1]),
        viper: { ...settings.viper, bassMode: 3, bassLevel: 0.35, dcvEnable: true, loudnessEnable: true, limiterEnable: false, cureEnable: false } });
      break;
    case 'night': // 夜听:压低频防扰、响度补偿细节、限幅
      activePresetName = '柔和';
      commit({ ...settings, eq: eq([-5, -4, -2, 0, 2, 3, 3, 2, 1, -2]),
        viper: { ...settings.viper, bassMode: 0, loudnessEnable: true, dcvEnable: true, limiterEnable: true, cureEnable: false } });
      break;
    case 'scene':
      activePresetName = '';
      commit({ ...settings, eq: eq([2, 3, 1, 0, 0, 1, 2, 3, 4, 3]), reverb: { id: 'v_presence', mainGain: 1.2, sendGain: 0.9 },
        viper: { ...settings.viper, bassMode: 0, loudnessEnable: true, limiterEnable: true, dcvEnable: false, cureEnable: true, cureLevel: 0.3 } });
      break;
    case 'custom': break; // 只切换标记
  }
  persist(); notify();
}

// lx52: AutoEq 耳机校正库
export const AUTOEQ_MODELS = Object.keys(autoeqPack).sort();
export function autoeqProfile(name: string): AutoeqProfile | null {
  return autoeqPack[name] ?? null;
}

export function saveNewPreset(name: string): string | null {
  const n = name.trim();
  if (!n) return '名称不能为空';
  if ([...FX_DEFAULT_PRESETS, ...customPresets].some(p => p.name === n)) return '预设名称已存在';
  customPresets = [...customPresets, { name: n, values: [...settings.eq] }];
  activePresetName = n;
  persist(); pushToServerSoon(); notify();
  return null;
}

export function renameCustomPreset(oldName: string, newName: string): string | null {
  const n = newName.trim();
  if (!n || n === oldName) return n ? null : '名称不能为空';
  if ([...FX_DEFAULT_PRESETS, ...customPresets].some(p => p.name === n)) return '名称已存在';
  customPresets = customPresets.map(p => (p.name === oldName ? { ...p, name: n } : p));
  if (activePresetName === oldName) activePresetName = n;
  persist(); pushToServerSoon(); notify();
  return null;
}

export function deleteCustomPreset(name: string) {
  customPresets = customPresets.filter(p => p.name !== name);
  if (activePresetName === name) activePresetName = '';
  persist(); pushToServerSoon(); notify();
}
