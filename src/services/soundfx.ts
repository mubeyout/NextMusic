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

export interface FxPanner { enable: boolean; speed: number; distance: number }
export interface FxReverb { id: string; mainGain: number; sendGain: number }
export interface FxSettings { eq: number[]; pitch: number; panner: FxPanner; reverb: FxReverb }
export interface FxPreset { name: string; values: number[] }

export const FX_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const FX_FREQ_LABELS = FX_FREQS.map(f => (f >= 1000 ? f / 1000 + 'k' : String(f)));

// 与 lxserver defaultPresets 完全一致
export const FX_DEFAULT_PRESETS: FxPreset[] = [
  { name: '流行', values: [6, 5, -3, -2, 5, 4, -4, -3, 6, 4] },
  { name: '舞曲', values: [4, 3, -4, -6, 0, 0, 3, 4, 4, 5] },
  { name: '摇滚', values: [7, 6, 2, 1, -3, -4, 2, 1, 4, 5] },
  { name: '古典', values: [6, 7, 1, 2, -1, 1, -4, -6, -7, -8] },
  { name: '人声', values: [-5, -6, -4, -3, 3, 4, 5, 4, -3, -3] },
  { name: '慢歌', values: [5, 4, 2, 0, -2, 0, 3, 6, 7, 8] },
  { name: '电子乐', values: [6, 5, 0, -5, -4, 0, 6, 8, 8, 7] },
  { name: '重低音', values: [8, 7, 5, 4, 0, 0, 0, 0, 0, 0] },
  { name: '柔和', values: [-5, -5, -4, -4, 3, 2, 4, 4, 0, 0] },
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
];

const kv = createMMKV({ id: 'nextmusic-fx' });
const KEY = 'lx_sound_effects';

function defaultSettings(): FxSettings {
  return {
    eq: Array(10).fill(0),
    pitch: 1.0,
    panner: { enable: false, speed: 25, distance: 5 },
    reverb: { id: 'none', mainGain: 1.0, sendGain: 0 },
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
    out.reverb = {
      id: known ? s.reverb.id! : 'none',
      mainGain: Math.max(0, Math.min(3, Number(s.reverb.mainGain) || 1)),
      sendGain: Math.max(0, Math.min(3, Number(s.reverb.sendGain) || 0)),
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
  try {
    NativeModules.SoundFx?.setConfig({
      eq: settings.eq,
      reverb: { id: settings.reverb.id, mainGain: settings.reverb.mainGain, sendGain: settings.reverb.sendGain },
      panner: { enable: settings.panner.enable, speed: settings.panner.speed, distance: settings.panner.distance },
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
  fetchFxFromServer();
}

// ---------- 管理操作（对齐 lxserver soundEffects manager API） ----------
function commit(next: FxSettings) {
  settings = next;
  persist(); applyNative(); pushToServerSoon(); notify();
}

export function setEQ(index: number, val: number) {
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
  const r = FX_REVERB_OPTIONS.find(x => x.id === id);
  if (!r) return;
  commit({ ...settings, reverb: { id: r.id, mainGain: r.main, sendGain: r.send } });
}

export function setReverbGain(type: 'main' | 'send', val: number) {
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
  commit({ ...settings, panner: { ...settings.panner, ...patch } });
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
