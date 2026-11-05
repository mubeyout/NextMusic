// Design tokens — extracted 1:1 from Figma "测试2" · NextMusic design system
// 注意：C 必须可变（主题覆写）；且本模块是最早被 UI 模块加载的地方，主题在模块加载期应用，
// 否则各屏 StyleSheet.create 时周化的就是默认色（accent/纯黑永远不生效的根因）
import { settings } from '../services/settings';
import { themeColors, SPACE, RADIUS, TYPE, DESIGN } from './design-system';

export const C: Record<string, string> = themeColors(settings.get());

// 启动期主题覆写（模块加载时同步执行；后续所有 StyleSheet.create 拿到的就是用户主题）
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
  T.light = !!s.light;
  Object.assign(C, themeColors(s));
}

applyBootTheme();

// ─── [老板 1011 12:04] 全局设计 token:间距/字号收敛规范(详见 docs/design-tokens.md;旧 SP.screen/FS.title28 体系零使用点已并入) ───
/** 间距档:全偶数 4-24,共 9 档(淘汰 2/3/5/7/9/11 碎片档——就近归并;新代码禁裸写数字 gap) */
export const SP = { xs: SPACE.xs, sm: SPACE.sm, md: SPACE.sm, lg: SPACE.md, xl: SPACE.md, xxl: SPACE.lg, section: SPACE.xxl, wide: SPACE.lg, wider: SPACE.xl, big: SPACE.xl, screen: SPACE.lg } as const;
/** 字号档:10-28 全整数,共 12 档(淘汰 8/9 特小档与 .5 半档——8/9→10,10.5→11,11.5→12,12.5→13;新代码禁裸写 fontSize) */
export const FS = { xs: TYPE.caption, sm: TYPE.caption, body: TYPE.body, md: TYPE.body, lg: 16, xl: 16, title: TYPE.subtitle, headline: TYPE.subtitle, h2: 20, h1: TYPE.title, display: 28, hero: TYPE.hero } as const;

// ── [老板 1011 15:39 全局统一令] 字重/网格/卡宽 token(唯一定义源;详见 docs/design-tokens.md) ──
/** 字重档:5 主档+900 特例;新代码禁裸写 fontWeight 字符串 */
export const FW = { normal: '400', medium: '500', semibold: '600', bold: '700', heavy: '800', black: '900' } as const;
export type FontWeightToken = keyof typeof FW;

/** 网格系统:墙列基档(phone 百分比)/HD 密网格参数/栅格与页边距(跨页面零差距唯一源) */
export const GRID = {
  wallTiers: [[1500, '15%'], [1100, '18%'], [800, '23%'], [600, '31%'], [0, '47%']] as [number, string][], // phone 墙列基(GridBasis/DiscCard 同源)
  hdMin: DESIGN.layout.Desktop.cardMin,     // HD/web 密网格最小卡宽 dp(×uiScale;探索同款)
  hdGap: SPACE.md, hdMaxCols: 8, hdMinCols: 1,
  gutterHD: DESIGN.layout.HD.pagePadding,   // HD 内页水平栅格(hdstyle.GUTTER 同源)
  pageHD: DESIGN.layout.HD.pagePadding,     // HD 页边距(为我推荐基准)
  pagePhone: DESIGN.layout.Phone.pagePadding,  // phone 内容页边距(Home/Explore 基准)
  libPhone: DESIGN.layout.Phone.pagePadding,   // 库族页边距(LibraryHome 基准)
} as const;

/** 卡宽档:同层级卡跨页面同大小(rail 封面卡=PvCard 基准;迷你卡=最近播放层) */
export const CARD = {
  rail: { phone: 112, web: 132, hd: 148 }, // rail 封面卡宽(RailCard/PvCard/DiscCard/搜索专辑/艺人专辑卡全对齐)
  mini: 80,                                 // 迷你卡(最近播放 rail)
  radius: RADIUS.card,                               // nm-card 标准圆角
  radiusHero: RADIUS.hero,                           // 英雄卡圆角
} as const;
export type SpaceToken = keyof typeof SP;
export type FontToken = keyof typeof FS;
// 旧键别名(零使用点,保险兼容)
export const FS_OLD = { title28: FS.hero, title24: FS.display, title18: FS.h2, title17: FS.headline, body14: FS.lg, body13: FS.md, body12: FS.body, caption11: FS.sm, caption10: FS.xs } as const;
