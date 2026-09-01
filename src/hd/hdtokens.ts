// HD(车机/TV)设计尺寸 —— 对齐桌面版(NextMusic-Desktop)设计语言
// 映射:桌面 150% zoom 在 1920x1080 TV = 1280x720 CSS 视口;TV dp 视口 960x540 → 系数 0.75
// 色彩:桌面版深色主题原值(index.css html.nm-dark),HD 恒深色,不随手机主题
export const C = {
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
};

export const H = {
  // 字号(桌面 px × 0.75)
  font: {
    xs: 9,
    sm: 10,
    md: 11,
    lg: 12,
    xl: 15,
    hero: 21,
  },
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
export const shadowOf = (seed: string) => {
  const h = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const s = 0.62, l = 0.42;
  const cH = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60, x = cH * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [cH, x, 0] : hp < 2 ? [x, cH, 0] : hp < 3 ? [0, cH, x] : hp < 4 ? [0, x, cH] : hp < 5 ? [x, 0, cH] : [cH, 0, x];
  const m = l - cH / 2;
  const R = Math.round((r1 + m) * 255), G = Math.round((g1 + m) * 255), B = Math.round((b1 + m) * 255);
  return `0 10px 30px rgba(${R},${G},${B},.34)`;
};
// 玻璃磨砂面(桌面 --nm-glass 深色值;RN 无 backdrop-filter,用半透明+亮边近似)
export const GLASS = 'rgba(16,18,22,.66)';
export const GLASS_STRONG = 'rgba(22,25,30,.8)';
