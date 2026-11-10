// cartokens.ts —— [车机专属页面族 1105] 尺寸 token(LEO v7 实施规格 §2 直抄)
export const CAR = {
  sidebar: 261,        // 侧栏宽
  navItem: 64,         // 主导航项高 [老板 1110] 54→64 车机触控加大
  navItemSub: 56,      // 歌单子项高 [老板 1110] 44→56
  gutter: 33,          // 页边距
  hero: 31,            // 问候/页标题
  secTitle: 22,        // 区头
  body: 16,            // 行主字
  sub: 13,             // 最小副行
  bigCard: { h: 156, r: 17 },   // 双大卡
  recCard: { w: 138, r: 14 },   // 歌单竖卡
  chCard: { h: 132, r: 16 },    // 播客频道卡
  bCard: { h: 210, r: 16 },     // 榜单卡
  songRow: { h: 88, art: 72, r: 12 }, // 歌曲行
  playbar: { h: 96, art: 60, r: 12 }, // 播放条(无进度行)
  player: { disc: 480, ctrl: 88 },    // 播放页盘+主控
  sectionGap: 32,
  gap: 22,
} as const;

// ── 720 高紧凑档(车机 1920×720/TV 横屏)──[MOMO 风险2·1106]
// 720 竖向空间只有 1080 的 2/3:双大卡/歌曲行/竖卡整体压缩,首屏密度保三行+rail
// [LEO 1107] 8 色降彩度一档 + accent token 化(装饰主体色集中,禁散落字面色)
export const CAR_ACCENTS = {
  b1: '#3B2F6F', b2: '#1E5F56', b3: '#6E4A2F', b4: '#52486B',
  b5: '#2F6B6B', b6: '#1ED760', b7: '#6B3A4A', b8: '#3A4A5C',
} as const;

// [LEO 1107] 字号唯一表(31/22/18/16/15/13/12)——禁出现表外字号
export const CAR_FS = {
  hero: 31, sec: 22, title: 18, body: 16, sub: 15, mini: 13, tiny: 12,
} as const;

export const CAR_COMPACT = 0.84;
export function carScale(h: number): number {
  if (h >= 1000) return 1;      // 1080+ 真车/TV 全档
  if (h >= 800) return 0.94;   // 900 档
  return CAR_COMPACT;          // ≤799(720 车机横屏)
}
