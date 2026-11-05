// cartokens.ts —— [车机专属页面族 1105] 尺寸 token(LEO v7 实施规格 §2 直抄)
export const CAR = {
  sidebar: 261,        // 侧栏宽
  navItem: 54,         // 主导航项高
  navItemSub: 44,      // 歌单子项高
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
