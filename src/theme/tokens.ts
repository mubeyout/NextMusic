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
  elev: '#1C1C1C',        // 弹层/迷你条/浮卡（浅色下为纯白卡）
  text: '#FFFFFF',
  text2: '#B3B3B3',
  text3: '#595959',
  onBrand: '#121212',     // text on green/white pills
  white: '#FFFFFF',
  stroke: '#FFFFFF14',
  // —— 语义层（浅色适配轮）：深色值 = 原硬编码，浅色在 applyBootTheme 覆写 ——
  inset: '#242424',        // 圆钮底/进度槽/徽标/pill/输入框
  inset2: '#2E2E2E',       // 开关轨道/图标圈/头像底/音量槽
  inputBar: '#141414',     // 播放页工具条/评论区输入条
  searchPill: '#171717',   // 探索页搜索条
  strokeFaint: '#FFFFFF0F',  // hairline 分隔线
  strokeStrong: '#FFFFFF1F', // ghost 按钮描边
  handle: '#FFFFFF2E',     // sheet 把手
  scrim: '#000000AA',      // 弹层遮罩
  artTint: '#233029',      // 封面占位底
  artTint2: '#1E2B24',     // 艺术家占位底
  selTint: '#14251C',      // 选中行/选中步骤条
  badgeOn: '#0E3B1F',      // 已连接徽标底
  knobOn: '#0E3B1F',       // 开关 on 钮（浅色下白色钮）
  knob: '#FFFFFF',         // Fx 开关钮（浅色 off 态灰钮）
  failTint: '#2A1A1A',     // 下载失败卡底
  sheet: '#161618F5',      // 半透明抽屉面（浅色下乳白）
  brandText: '#1ED760',    // 绿色文字（浅色下换深绿，避免绿字贴白底看不清）
  heart: '#FF5A76',        // 收藏心形(spotify pink;v3.28 全局 token 化,散落硬编码收口)
  danger: '#FF6B6B',       // 错误/危险色(与 HD hdtokens 同值;[LEO 1011 统一令] 散落 #FF6B6B/#E8618C 收口)
};

// 启动期主题覆写（模块加载时同步执行；后续所有 StyleSheet.create 拿到的就是用户主题）
function blend(hex: string, base: string, k: number): string {
  // hex/base: #RRGGBB；结果 = base*(1-k) + hex*k（把强调色压暗成背景渐变顶色）
  const h = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map(i => parseInt(base.slice(i, i + 2), 16));
  return '#' + h.map((v, i) => Math.round(v * k + b[i] * (1 - k)).toString(16).padStart(2, '0')).join('').toUpperCase();
}
// 运行时主题标志（状态栏图标色等非 StyleSheet 场景用）；必须在 applyBootTheme() 调用前声明
export const T = { light: false };

// 渐变软化：浅色主题下把深色渐变提亮为 pastel（深色原样返回）；
// 配套规则：用 softGrad 的卡内文字用 C.text/C.text2（深色下=白/灰 原样，浅色下=深色字配 pastel）
function mixHex(a: string, b: string, k: number): string {
  const A = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const B = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + A.map((v, i) => Math.round(v * (1 - k) + B[i] * k).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function softGrad(...cs: string[]): string[] {
  // vc95:浅色下降级单色渐变(纯色渲染)——低端机 LinearGradient drawable 创建风暴是卡顿主源(老板真机白闪/卡顿/闪退同源);深色保留
  return T.light ? cs.map(() => mixHex(cs[0], '#FFFFFF', 0.88)) : cs;
}

export function applyBootTheme() {
  const s = settings.get();
  // vc79：绿系语义 token 全套跟随 accent 派生（此前 brandText/selTint/badgeOn 恒绿——蓝 accent 下蓝图标绿字混搭）
  const acc = (s.accent && /^#[0-9A-Fa-f]{6}$/.test(s.accent) && s.accent !== '#1ED760') ? s.accent : null;
  if (acc) {
    C.brand = acc;
    C.brandDim = acc + '47';
    C.brandSoft = acc;
    C.brandText = acc;
    C.bgGradientTop = blend(acc, '#121212', 0.16);
  }
  if (s.pureBlack) {
    C.bg = '#000000';
    C.surface = '#0D0D0D';
    C.surface2 = '#161616';
  }
  // 浅色主题：与桌面 Web (nextmusic-desktop) :root 浅色盘同源，优先级高于纯黑
  if (s.light) {
    T.light = true;
    C.bg = '#F6F7F9';
    C.bgDeep = '#FFFFFF';
    C.bgGradientTop = acc ? blend(acc, '#F6F7F9', 0.14) : '#EAF6EE';
    C.surface = '#FFFFFF';
    C.surface2 = '#F0F1F4';
    C.elev = '#FFFFFF';
    C.text = '#26282C';
    C.text2 = '#62676E';
    C.text3 = '#8B9199';
    C.onBrand = acc ? mixHex(acc, '#000000', 0.52) : '#0B3D1F';
    C.brandSoft = acc ? mixHex(acc, '#000000', 0.22) : '#1DB455';   // 浅色下高亮色加深（桌面同款规则）
    C.stroke = '#1F232914';    // rgba(31,35,41,.08)
    C.inset = '#EDEFF3';
    C.inset2 = '#E4E7EC';
    C.inputBar = '#F0F1F4';
    C.searchPill = '#ECEEF2';
    C.strokeFaint = '#1F232912';
    C.strokeStrong = '#1F232924';
    C.handle = '#1F23293D';
    C.scrim = '#00000066';
    C.brandText = acc ? mixHex(acc, '#000000', 0.40) : '#0E8A44';
    C.selTint = acc ? mixHex(acc, '#FFFFFF', 0.87) : '#DFF2E7';
    C.badgeOn = acc ? mixHex(acc, '#FFFFFF', 0.88) : '#D9F4E5';
    C.artTint = acc ? mixHex(acc, '#FFFFFF', 0.90) : '#E7F1EB';
    C.artTint2 = acc ? mixHex(acc, '#FFFFFF', 0.90) : '#E7F1EB';
    C.knobOn = '#FFFFFF';
    C.knob = '#8F969E';
    C.failTint = '#FDEEEE';
    C.sheet = '#FAFBFCF5';
  }
}
applyBootTheme();

// ─── [老板 1011 12:04] 全局设计 token:间距/字号收敛规范(详见 docs/design-tokens.md;旧 SP.screen/FS.title28 体系零使用点已并入) ───
/** 间距档:全偶数 4-24,共 9 档(淘汰 2/3/5/7/9/11 碎片档——就近归并;新代码禁裸写数字 gap) */
export const SP = { xs: 4, sm: 6, md: 8, lg: 10, xl: 12, xxl: 14, section: 18, wide: 16, wider: 20, big: 24, screen: 20 } as const; // [12:44] section=18 为我推荐段距基准档
/** 字号档:10-28 全整数,共 12 档(淘汰 8/9 特小档与 .5 半档——8/9→10,10.5→11,11.5→12,12.5→13;新代码禁裸写 fontSize) */
export const FS = { xs: 10, sm: 11, body: 12, md: 13, lg: 14, xl: 15, title: 16, headline: 17, h2: 18, h1: 20, display: 24, hero: 28 } as const;
export type SpaceToken = keyof typeof SP;
export type FontToken = keyof typeof FS;
// 旧键别名(零使用点,保险兼容)
export const FS_OLD = { title28: FS.hero, title24: FS.display, title18: FS.h2, title17: FS.headline, body14: FS.lg, body13: FS.md, body12: FS.body, caption11: FS.sm, caption10: FS.xs } as const;
