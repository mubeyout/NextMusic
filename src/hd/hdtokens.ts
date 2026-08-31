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
