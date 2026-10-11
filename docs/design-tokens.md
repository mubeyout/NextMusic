# NextMusic 设计 Token 规范 — 2026-10-11（老板令「全局 gap/字号统一，建样式组件库」）

> 源:`src/theme/tokens.ts` 的 `SP`(间距)/`FS`(字号);颜色沿用既有 `C`。**新代码禁裸写 `fontSize: <数字>` 与 `gap: <数字>`,一律 token。**

## 一、间距 SP(9 档,全偶数)
| token | 值 | 用途 | 碎片归并(存量迁移) |
|---|---|---|---|
| SP.xs | 4 | 图标内隙/紧凑标签 | 2/3 → xs |
| SP.sm | 6 | 图标+文字内隙 | 5/7 → sm |
| SP.md | 8 | 行内元素/紧凑行距 | — |
| SP.lg | 10 | 卡片内隙/行距主档 | 9/11 → lg/xl |
| SP.xl | 12 | 卡片内边距/分区内距 | — |
| SP.xxl | 14 | 分区间距(HD rail) | — |
| SP.wide | 16 | 页边距主档/大卡内距 | 18 → wide |
| SP.wider | 20 | 页边距(探索/搜索) | — |
| SP.big | 24 | 大分区距/页面留白 | — |

## 二、字号 FS(12 档,全整数)
| token | 值 | 用途 | 碎片归并 |
|---|---|---|---|
| FS.xs | 10 | 卡副行/微注 | 8/9/10.5 → xs |
| FS.sm | 11 | 卡名副行/标签 | 11.5 → sm |
| FS.body | 12 | 卡名/次要文本(最高频) | 12.5 → body |
| FS.md | 13 | 正文/行标题 | — |
| FS.lg | 14 | 输入框/强调正文 | — |
| FS.xl | 15 | 区头标题 | — |
| FS.title | 16 | 大区头/HD 行标题 | — |
| FS.headline | 17 | HD 区头/英雄副行 | — |
| FS.h2 | 18 | 页面次标题 | — |
| FS.h1 | 20 | 页面标题/图标 | — |
| FS.display | 24 | 页大标题 | — |
| FS.hero | 28 | 大标题(HD) | — |

## 三、组件库(集体调用,禁自造)
| 件 | 位置 | 统一范围 |
|---|---|---|
| SongRow | src/components/SongRow.tsx | 全部歌曲行(MyLibrary 局部版退役——P1-1) |
| ArtistRow | src/components/ArtistRow.tsx(新) | 全部歌手行(MediaLibs st.artistRow/公共库 rowCard/HD bv.row) |
| PlaylistRow | src/components/PlaylistRow.tsx(新) | 全部歌单/列表行(MediaLibs st.plRow/dualCard 族) |
| PvCard / RailCard / DiscCard | 既有 | 封面卡(已统一 ✓) |
| SectionHead / HomeSection / Rail | 既有 | 分区头+横滑轨 |
| LibActions | LibraryHome | 动作按钮行 |
| HeroPair / HeroCard | LibraryHome | 英雄卡 |

## 四、迁移计划
- 批次1(本轮):三大件统一+四屏重灾区(MediaLibs/PublicLibrary/MyLibrary/CloudLibrary)token 化+碎片归并
- 批次2(下轮):其余屏随响应式批 D-H 顺迁;tsc 全程 0 错
