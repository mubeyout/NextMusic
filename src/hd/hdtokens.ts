// HD(车机/TV)设计尺寸 —— 对齐桌面版(NextMusic-Desktop)设计语言
// 映射:桌面 150% zoom 在 1920x1080 TV = 1280x720 CSS 视口;TV dp 视口 960x540 → 系数 0.75
// 色彩:默认深色(桌面深色主题原值);vc81 起支持浅色+强调色(与手机/桌面同规则,重启生效)
import { settings } from '../services/settings';

export const C: Record<string, string> = {
  brand: '#1ED760',
  brandSoft: '#6BE88F',
  brandDim: 'rgba(30,215,96,.14)',
  onBrand: '#06130B',
  danger: '#FF6B6B',
  bg: '#121212',
  bgDeep: '#06080D',
  surface: '#1A1A1A',
  elev: '#1C1C1C',
  hover: 'rgba(255,255,255,.05)',
  input: 'rgba(255,255,255,.06)',
  pop: '#22262E',
  track: 'rgba(255,255,255,.14)',
  grad1: 'rgba(255,255,255,.055)',
  grad2: 'rgba(255,255,255,.018)',
  border: 'rgba(255,255,255,.08)',
  stroke: 'rgba(255,255,255,.08)',
  text: '#FFFFFF',
  text2: '#B3B3B3',
  text3: '#595959',
  // 玻璃磨砂面(桌面 --nm-glass 同源;浅色覆写)
  glass: 'rgba(16,18,22,.66)',
  glassStrong: 'rgba(22,25,30,.8)',
};

export const T = { light: false };
// TV/车机性能开关:小米电视实测彩色投影+聚焦 glow 重绘掉帧;网格卡投影与 glow 全降级
export const TV_LOW_GPU = false; // lx93(老板要求):彩色弥散投影回归——vc81 动画全 native driver+懒挂载后 GPU 预算够

function mixHex(a: string, b: string, k: number): string {
  const A = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const B = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + A.map((v, i) => Math.round(v * (1 - k) + B[i] * k).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// 启动期主题覆写(与手机 tokens.applyBootTheme 同构:accent 全套派生 + 浅色盘)
export function applyHdTheme() {
  const s = settings.get();
  const acc = (s.accent && /^#[0-9A-Fa-f]{6}$/.test(s.accent) && s.accent !== '#1ED760') ? s.accent : null;
  if (acc) {
    C.brand = acc;
    C.brandSoft = acc;
    C.brandDim = acc + '24'; // ≈14%
  }
  if (s.pureBlack) {
    C.bg = '#000000';
    C.surface = '#0D0D0D';
  }
  if (s.light) {
    T.light = true;
    C.bg = '#F6F7F9';
    C.bgDeep = '#FFFFFF';
    C.surface = '#FFFFFF';
    C.elev = '#FFFFFF';
    C.pop = '#FFFFFF';
    C.text = '#26282C';
    C.text2 = '#62676E';
    C.text3 = '#8B9199';
    C.hover = 'rgba(31,35,41,.045)';
    C.input = 'rgba(31,35,41,.04)';
    C.track = 'rgba(31,35,41,.14)';
    C.grad1 = 'rgba(31,35,41,.045)';
    C.grad2 = 'rgba(31,35,41,.012)';
    C.border = 'rgba(31,35,41,.08)';
    C.stroke = C.border;
    C.onBrand = acc ? mixHex(acc, '#000000', 0.52) : '#0B3D1F';
    C.brandSoft = acc ? mixHex(acc, '#000000', 0.22) : '#1DB455';
    C.glass = 'rgba(255,255,255,.68)';
    C.glassStrong = 'rgba(255,255,255,.8)';
    // 投影浅色化(桌面 --nm-shadow-* 浅色同源)
    SH.card = '0 12px 36px rgba(31,35,41,.10)';
    SH.pop = '0 18px 52px rgba(31,35,41,.18)';
    SH.brand = '0 6px 22px rgba(29,180,85,.26)';
    SH.focus = '0 4px 16px rgba(29,180,85,.20)';
  }
}
// applyHdTheme() 的调用在文件末尾(SH 等 const 先于执行,避免 TDZ)

// 界面缩放(设置→外观):重启生效——重启即 JS runtime 重载,所有 StyleSheet.create 以新值重建
export const UI_SCALES = ['90%', '100%', '110%', '125%'] as const;
export type UiScale = (typeof UI_SCALES)[number];
const scaleOf = (s: string | undefined): number => (s === '90%' ? 0.9 : s === '110%' ? 1.1 : s === '125%' ? 1.25 : 1);

export const H = {
  // 字号(桌面 px × 0.75 × 缩放)
  font: { xs: 9, sm: 10, md: 11, lg: 12, xl: 15, hero: 21 },
  // 触点:遥控/车机最低可用
  touch: 44,
  // 行高(歌曲行)
  row: 46,
  // 侧栏宽(232×0.75)
  sidebar: 174,
  // 播放条高(84×0.75)
  playbar: 64,
  // 圆角
  radius: { card: 11, row: 8, pill: 999 },
};

// 按 uiScale 重算 H(H 保持同一引用,属性覆写——引用处 import { H } 不变)
// v1.2.6(老板:胶囊+分割线错位):web 跳过——桌面缩放唯一源是 CSS zoom(main.tsx applyZoom),
// tokens 再乘一遍 = 双重缩放:侧栏 217.5 CSS vs 轨道/卡片锁 174 CSS 硬编码,品牌条越轨成"胶囊"、分割线错开 55px
export function applyHdScale(uiScale?: string) {
  if (Platform.OS === 'web') return;
  const k = scaleOf(uiScale);
  const f = { xs: 9, sm: 10, md: 11, lg: 12, xl: 15, hero: 21 };
  (Object.keys(f) as (keyof typeof f)[]).forEach(key => { H.font[key] = f[key] * k; });
  H.touch = 44 * k;
  H.row = 46 * k;
  H.sidebar = 174 * k;
  H.playbar = 64 * k;
  H.radius = { card: 11 * k, row: 8 * k, pill: 999 };
}

export const fmtSec = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// 彩色弥散投影(对齐桌面 --nm-shadow-*;RN 0.76+ New Arch boxShadow 字符串语法)
export const SH = {
  card: '0 8px 28px rgba(0,0,0,.5)',
  brand: '0 6px 22px rgba(30,215,96,.35)',
  pop: '0 12px 32px rgba(0,0,0,.6)',
  focus: '0 4px 16px rgba(30,215,96,.25)',
};

// ---------- 桌面 9280 对齐(2026-09-01 老板:样式交互 1:1) ----------
// 彩色弥散投影:与桌面 shadowOf 同公式(按名取色,hsl→rgba 单层,RN boxShadow 兼容)
// TV/车机(HD)降级返回 none:弱 GPU 上大量网格卡彩色投影导致重绘卡顿(小米电视实测)
export const shadowOf = (seed: string) => {
  if (TV_LOW_GPU) return 'none';
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const s = 0.55, l = 0.5;
  const cH = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60, x = cH * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [cH, x, 0] : hp < 2 ? [x, cH, 0] : hp < 3 ? [0, cH, x] : hp < 4 ? [0, x, cH] : hp < 5 ? [x, 0, cH] : [cH, 0, x];
  const m = l - cH / 2;
  const R = Math.round((r1 + m) * 255), G = Math.round((g1 + m) * 255), B = Math.round((b1 + m) * 255);
  return `0 10px 30px rgba(${R},${G},${B},.24)`; // lx128:.34 太重 .15 看不见——中间值
};
// lx96:紧凑弥散投影——横向滚动行内小卡专用(30px 大弥散会被 ScrollView 裁切,需要 ≤16px 行内边距预算)
// lx132:彩色弥散光晕(描边式)——RN Android boxShadow 在米电视 GPU 不稳定(红色巨影实测渲染失败);
// 描边光晕=自绘 border,恒定渲染、零裁切
// lx136:Android 原生彩色弥散投影——elevation+shadowColor(View.setElevation+outlineAmbient/SpotShadowColor API28+),
// 系统级渲染,比 RN CSS boxShadow 模拟稳定(米电视上 CSS 模拟时灵时不灵)
export function shadowStyleOf(seed: string): { elevation: number; shadowColor: string } {
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const s2 = 0.7, l = 0.55;
  const cH = (1 - Math.abs(2 * l - 1)) * s2;
  const hp = h / 60, x = cH * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [cH, x, 0] : hp < 2 ? [x, cH, 0] : hp < 3 ? [0, cH, x] : hp < 4 ? [0, x, cH] : hp < 5 ? [x, 0, cH] : [cH, 0, x];
  const m = l - cH / 2;
  return { elevation: 8, shadowColor: `rgb(${Math.round((r1 + m) * 255)},${Math.round((g1 + m) * 255)},${Math.round((b1 + m) * 255)})` };
}

export function haloOf(seed: string): string {
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const s2 = 0.62, l = 0.5;
  const cH = (1 - Math.abs(2 * l - 1)) * s2;
  const hp = h / 60, x = cH * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [cH, x, 0] : hp < 2 ? [x, cH, 0] : hp < 3 ? [0, cH, x] : hp < 4 ? [0, x, cH] : hp < 5 ? [x, 0, cH] : [cH, 0, x];
  const m = l - cH / 2;
  const R = Math.round((r1 + m) * 255), G = Math.round((g1 + m) * 255), B = Math.round((b1 + m) * 255);
  return `rgba(${R},${G},${B},0.20)`;
}

export const shadowOfSm = (seed: string) => {
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const s = 0.55, l = 0.5;
  const cH = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60, x = cH * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [cH, x, 0] : hp < 2 ? [x, cH, 0] : hp < 3 ? [0, cH, x] : hp < 4 ? [0, x, cH] : hp < 5 ? [x, 0, cH] : [cH, 0, x];
  const m = l - cH / 2;
  const R = Math.round((r1 + m) * 255), G = Math.round((g1 + m) * 255), B = Math.round((b1 + m) * 255);
  return `0 5px 14px rgba(${R},${G},${B},.13)`; // lx167:减淡50%
};

// v1.2.5 桌面:web 卡片彩色弥散投影——shadowStyleOf(elevation+shadowColor)在 RNW 不渲染(桌面卡片变灰块的真因);
// RNW 会把 iOS 系 shadow* 四件套转成 CSS box-shadow,与 shadowOf 同色公式
import { Platform } from 'react-native';
export function webCardShadow(seed: string, lift = false): Record<string, string | number | { width: number; height: number }> | null {
  if (Platform.OS !== 'web') return null;
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const s2 = 0.58, l = 0.5;
  const cH = (1 - Math.abs(2 * l - 1)) * s2;
  const hp = h / 60, x = cH * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [cH, x, 0] : hp < 2 ? [x, cH, 0] : hp < 3 ? [0, cH, x] : hp < 4 ? [0, x, cH] : hp < 5 ? [x, 0, cH] : [cH, 0, x];
  const m = l - cH / 2;
  return {
    shadowColor: `rgb(${Math.round((r1 + m) * 255)},${Math.round((g1 + m) * 255)},${Math.round((b1 + m) * 255)})`,
    shadowOffset: { width: 0, height: lift ? 14 : 8 },
    shadowOpacity: lift ? 0.17 : 0.11, // lx167(老板):投影减淡 50%
    shadowRadius: lift ? 20 : 12,
  };
}
// 玻璃磨砂面(桌面 --nm-glass 深色值;RN 无 backdrop-filter,用半透明+亮边近似)—— 已迁入 C.glass/C.glassStrong(浅色覆写需运行时查找,export let 在 Metro 下是值拷贝)
// 兼容旧引用
export const GLASS_REF = { get face() { return C.glass; }, get strong() { return C.glassStrong; } };

applyHdScale(settings.get().uiScale);
applyHdTheme();
