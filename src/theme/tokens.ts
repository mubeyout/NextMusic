// Design tokens — extracted 1:1 from Figma "测试2" · NextMusic design system
// 注意：C 必须可变（主题覆写）；且本模块是最早被 UI 模块加载的地方，主题在模块加载期应用，
// 否则各屏 StyleSheet.create 时周化的就是默认色（accent/纯黑永远不生效的根因）
import { settings } from '../services/settings';

export const C: Record<string, string> = {
  brand: '#1ED760',       // Next Green
  brandDim: '#1ed76047',
  brandSoft: '#6BE88F',   // lyrics active green
  bg: '#121212',          // Night
  bgDeep: '#06080D',      // player page
  bgGradientTop: '#0D2A1B',
  surface: '#1A1A1A',     // cards on Night (b3 area)
  surface2: '#232323',
  text: '#FFFFFF',
  text2: '#B3B3B3',
  text3: '#595959',
  onBrand: '#121212',     // text on green/white pills
  white: '#FFFFFF',
  stroke: '#FFFFFF14',
};

// 启动期主题覆写（模块加载时同步执行；后续所有 StyleSheet.create 拿到的就是用户主题）
function blend(hex: string, base: string, k: number): string {
  // hex/base: #RRGGBB；结果 = base*(1-k) + hex*k（把强调色压暗成背景渐变顶色）
  const h = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map(i => parseInt(base.slice(i, i + 2), 16));
  return '#' + h.map((v, i) => Math.round(v * k + b[i] * (1 - k)).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function applyBootTheme() {
  const s = settings.get();
  if (s.accent && /^#[0-9A-Fa-f]{6}$/.test(s.accent) && s.accent !== '#1ED760') {
    C.brand = s.accent;
    C.brandDim = s.accent + '47';
    C.brandSoft = s.accent;
    C.bgGradientTop = blend(s.accent, '#121212', 0.16);
  }
  if (s.pureBlack) {
    C.bg = '#000000';
    C.surface = '#0D0D0D';
    C.surface2 = '#161616';
  }
}
applyBootTheme();

export const SP = {
  screen: 20,             // horizontal page padding (Figma @20, width 350 on 390)
};

export const FS = {
  // rounded sizes used across screens
  title28: 28,
  title24: 24,
  title18: 18,
  title17: 17,
  body14: 14,
  body13: 13,
  body12: 12,
  caption11: 11,
  caption10: 10,
  small9: 9,
} as const;
