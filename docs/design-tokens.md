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

---

# 完整 Token 体系 — 2026-10-11 15:39（老板令「全局统一，跨页面零差距」）

> 唯一源：`src/theme/tokens.ts`（SP/FS/FW/GRID/CARD/C）+ `src/theme/grads.ts`（GRAD/gradOf）
> 新代码禁裸写：`fontSize/gap/fontWeight` 数字字符串、渐变数组、网格列基、rail 卡宽。

## 五、字重 FW（5 主档+特例）
| token | 值 | 用途 |
|---|---|---|
| FW.normal | 400 | 正文 |
| FW.medium | 500 | 次强调/标签 |
| FW.semibold | 600 | 卡名/行标题 |
| FW.bold | 700 | 区头/大标题 |
| FW.heavy | 800 | 品牌字/数字强调 |
| FW.black | 900 | 特排（存量 2 处） |

## 六、字体家族
全站系统字体栈（不引入自定义字体；性能与跨端一致优先）。数字等宽场景（时间码/时长）用 `fontVariant: ['tabular-nums']`。

## 七、网格系统 GRID
| token | 值 | 用途 |
|---|---|---|
| GRID.wallTiers | 1500→15% / 1100→18% / 800→23% / 0→31% | phone 墙列基（GridBasis/DiscCard 同源） |
| GRID.hdMin | 128（×uiScale） | HD/web 密网格最小卡宽（探索同款） |
| GRID.hdGap/hdMaxCols/hdMinCols | 12 / 9 / 3 | HDGrid 参数 |
| GRID.gutterHD | 22 | HD 内页水平栅格（hdstyle.GUTTER 同源） |
| GRID.pageHD / pagePhone / libPhone | 26 / 20 / 16 | 页边距（为我推荐 / Home·Explore / LibraryHome 三基准） |

**墙卡容器统一用 `components/GridWall`**：HD/web→HDGrid 密网格（探索同款），phone→31% 三列。
**rail 卡容器统一用 RailCard/PvCard**（或同构 nm-card 规格）。

## 八、卡宽 CARD（同层级卡跨页面同大小）
| token | 值 | 用途 |
|---|---|---|
| CARD.rail | phone 112 / web 132 / hd 148 | rail 封面卡宽（RailCard/PvCard/DiscCard fixedWidth/搜索专辑/艺人专辑全对齐） |
| CARD.mini | 80 | 迷你卡（最近播放） |
| CARD.radius | 12 | nm-card 标准圆角 |
| CARD.radiusHero | 16 | 英雄卡圆角 |

## 九、渐变 GRAD（src/theme/grads.ts 唯一源）
| token | 内容 | 用途 |
|---|---|---|
| GRAD.cover | 7 组沉稳深色系 | 无封面条目兜底（MyLibrary/PublicLibrary/MediaLibs/SongRow/PlaylistRow） |
| GRAD.quick | 6 组 | 快捷卡/自建歌单封面（MyScreen/HDMy） |
| gradOf(name) | 名哈希取组 | 同名字任意页面取到同一组（跨页视觉一致） |
| gradColorOf / gradCssOf | 单色/CSS 变体 | SongRow 底色 / web background |

基准页内保留：HERO_GRADS/LIB_KINDS（LibraryHome 共享件=唯一源）、BOARD_ACCENTS/GENRES/POD_GRADS（Home/Explore 基准页定稿）。

## 十、颜色 C
theme `C`（phone/web）与 hd `C`（HD）两套并存、语义对照（浅色覆写规则同源）；错误色统一 `C.danger`；渐变上文字恒 `C.white`，可变底上文字 `C.text/C.text2`（禁白）。
