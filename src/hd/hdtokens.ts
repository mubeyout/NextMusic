// HD(车机/TV)设计尺寸 —— 对齐桌面版(NextMusic-Desktop)设计语言
// 映射:桌面 150% zoom 在 1920x1080 TV = 1280x720 CSS 视口;TV dp 视口 960x540 → 系数 0.75
// 色彩:默认深色(桌面深色主题原值);vc81 起支持浅色+强调色(与手机/桌面同规则,重启生效)
import { settings } from '../services/settings';
import { themeColors } from '../theme/design-system';

export const C: Record<string, string> = themeColors(settings.get());

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
  T.light = !!s.light;
  Object.assign(C, themeColors(s));
  if (s.light) {
    SH.card = '0 12px 36px rgba(31,35,41,.05)';
    SH.pop = '0 18px 52px rgba(31,35,41,.09)';
    SH.brand = '0 6px 22px rgba(29,180,85,.13)';
    SH.focus = '0 4px 16px rgba(29,180,85,.10)';
  }
}
// applyHdTheme() 的调用在文件末尾(SH 等 const 先于执行,避免 TDZ)

// 界面缩放(设置→外观):重启生效——重启即 JS runtime 重载,所有 StyleSheet.create 以新值重建
export const UI_SCALES = ['90%', '100%', '110%', '125%', '150%'] as const;
export type UiScale = (typeof UI_SCALES)[number];
const scaleOf = (s: string | undefined): number => (s === '90%' ? 0.9 : s === '110%' ? 1.1 : s === '125%' ? 1.25 : s === '150%' ? 1.5 : 1); // 1028 老板令:加 150% 档(车机默认)

export const H = {
  // 字号(桌面 px × 0.75 × 缩放)
  font: { xs: 12, sm: 12, md: 14, lg: 16, xl: 18, hero: 24 },
  // 触点:遥控/车机最低可用
  touch: 56,
  // 行高(歌曲行)
  row: 56,
  // 侧栏宽(232×0.75)
  sidebar: 208,
  // 播放条高(84×0.75)
  playbar: 88,
  // 圆角
  radius: { card: 16, row: 12, pill: 999 },
};

// 按 uiScale 重算 H(H 保持同一引用,属性覆写——引用处 import { H } 不变)
// v1.2.6(老板:胶囊+分割线错位):web 跳过——桌面缩放唯一源是 CSS zoom(main.tsx applyZoom),
// tokens 再乘一遍 = 双重缩放:侧栏 217.5 CSS vs 轨道/卡片锁 174 CSS 硬编码,品牌条越轨成"胶囊"、分割线错开 55px
export function applyHdScale(uiScale?: string) {
  if (Platform.OS === 'web') return;
  const k = scaleOf(uiScale);
  const f = { xs: 12, sm: 12, md: 14, lg: 16, xl: 18, hero: 24 };
  (Object.keys(f) as (keyof typeof f)[]).forEach(key => { H.font[key] = f[key] * k; });
  H.touch = 56 * k;
  H.row = 56 * k;
  H.sidebar = 208 * k;
  H.playbar = 88 * k;
  H.radius = { card: 16 * k, row: 12 * k, pill: 999 };
}

export const fmtSec = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- lx170(动效 standard 档,Leo motion-spec 基准):easing token 唯一源 ----------
// CSS 侧(main.tsx :root --nm-ease-*)与 RN Animated 侧(数组→Easing.bezier)同源;换档改这里
export const EASE = {
  out: [0.23, 1, 0.32, 1],
  hover: [0.25, 0.1, 0.25, 1],
  inOut: [0.77, 0, 0.175, 1],
} as const;
// 桌面动效时长档位(standard;后续换档调这里)
export const MOTION = { enter: 150, exit: 100, hover: 160 } as const;

// 彩色弥散投影(对齐桌面 --nm-shadow-*;RN 0.76+ New Arch boxShadow 字符串语法)
export const SH = {
  // v1.2.11(老板):弥散投影再降 50%(card .5→.25 / pop .6→.3 / brand .35→.18 / focus .25→.12)
  card: '0 8px 28px rgba(0,0,0,.25)',
  brand: '0 6px 22px rgba(30,215,96,.18)',
  pop: '0 12px 32px rgba(0,0,0,.3)',
  focus: '0 4px 16px rgba(30,215,96,.12)',
};

// ---------- 桌面 9280 对齐(2026-09-01 老板:样式交互 1:1) ----------
// 彩色弥散投影:与桌面 shadowOf 同公式(按名取色,hsl→rgba 单层,RN boxShadow 兼容)
// TV/车机(HD)降级返回 none:弱 GPU 上大量网格卡彩色投影导致重绘卡顿(小米电视实测)
export const shadowOf = (seed: string) => {
  // 1028 老板令:弥散投影突兀,全端移除(seed 参数保留调用点兼容)
  return 'none';
  if (TV_LOW_GPU) return 'none';
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const s = 0.55, l = 0.5;
  const cH = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60, x = cH * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [cH, x, 0] : hp < 2 ? [x, cH, 0] : hp < 3 ? [0, cH, x] : hp < 4 ? [0, x, cH] : hp < 5 ? [x, 0, cH] : [cH, 0, x];
  const m = l - cH / 2;
  const R = Math.round((r1 + m) * 255), G = Math.round((g1 + m) * 255), B = Math.round((b1 + m) * 255);
  return `0 10px 30px rgba(${R},${G},${B},.12)`; // v1.2.11(老板):再降 50%(lx128 曾 .34→.24)
};
// lx96:紧凑弥散投影——横向滚动行内小卡专用(30px 大弥散会被 ScrollView 裁切,需要 ≤16px 行内边距预算)
// lx132:彩色弥散光晕(描边式)——RN Android boxShadow 在米电视 GPU 不稳定(红色巨影实测渲染失败);
// 描边光晕=自绘 border,恒定渲染、零裁切
// lx136:Android 原生彩色弥散投影——elevation+shadowColor(View.setElevation+outlineAmbient/SpotShadowColor API28+),
// 系统级渲染,比 RN CSS boxShadow 模拟稳定(米电视上 CSS 模拟时灵时不灵)
export function shadowStyleOf(seed: string): { elevation: number; shadowColor: string; borderWidth: number; borderColor: string } {
  // 1028 老板令:彩色弥散投影全端移除;LEO 规范 A.1② 素面卡补偿=hairline 描边(调用点即原投影卡,一处改全挂)
  return { elevation: 0, shadowColor: 'transparent', borderWidth: 1, borderColor: C.border };
}

export function haloOf(seed: string): string {
  // 1028 老板令:弥散光晕全端移除
  return 'transparent';
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const s2 = 0.62, l = 0.5;
  const cH = (1 - Math.abs(2 * l - 1)) * s2;
  const hp = h / 60, x = cH * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [cH, x, 0] : hp < 2 ? [x, cH, 0] : hp < 3 ? [0, cH, x] : hp < 4 ? [0, x, cH] : hp < 5 ? [x, 0, cH] : [cH, 0, x];
  const m = l - cH / 2;
  const R = Math.round((r1 + m) * 255), G = Math.round((g1 + m) * 255), B = Math.round((b1 + m) * 255);
  return `rgba(${R},${G},${B},0.05)`; // v1.2.11(老板):再降 50%(lx167b 曾 0.20→0.10)
}

export const shadowOfSm = (seed: string) => {
  // 1028 老板令:弥散投影全端移除
  return 'none';
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const s = 0.55, l = 0.5;
  const cH = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60, x = cH * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [cH, x, 0] : hp < 2 ? [x, cH, 0] : hp < 3 ? [0, cH, x] : hp < 4 ? [0, x, cH] : hp < 5 ? [x, 0, cH] : [cH, 0, x];
  const m = l - cH / 2;
  const R = Math.round((r1 + m) * 255), G = Math.round((g1 + m) * 255), B = Math.round((b1 + m) * 255);
  return `0 5px 14px rgba(${R},${G},${B},.065)`; // v1.2.11(老板):再降 50%(lx167 曾 .13)
};

// v1.2.5 桌面:web 卡片彩色弥散投影——shadowStyleOf(elevation+shadowColor)在 RNW 不渲染(桌面卡片变灰块的真因);
// RNW 会把 iOS 系 shadow* 四件套转成 CSS box-shadow,与 shadowOf 同色公式
import { Platform } from 'react-native';
export function webCardShadow(seed: string, lift = false): Record<string, string | number | { width: number; height: number }> | null {
  // 1028 老板令:web 卡片彩色弥散投影移除(hover 上浮由 useHoverCard 的 transform 承担)
  return null;
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
    shadowOpacity: lift ? 0.085 : 0.055, // v1.2.11(老板):弥散投影再降 50%(lx167 曾 0.11/0.17)
    shadowRadius: lift ? 20 : 12,
  };
}
// 玻璃磨砂面(桌面 --nm-glass 深色值;RN 无 backdrop-filter,用半透明+亮边近似)—— 已迁入 C.glass/C.glassStrong(浅色覆写需运行时查找,export let 在 Metro 下是值拷贝)
// 兼容旧引用
export const GLASS_REF = { get face() { return C.glass; }, get strong() { return C.glassStrong; } };

applyHdScale(settings.get().uiScale);
applyHdTheme();
