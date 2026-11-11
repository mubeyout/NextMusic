# 产品设计包 → 真机迁移蓝图（MIGRATION-SPEC）

> 基准：docs/design/product-html（老板投递权威包）。HD/CAR 共享一套引擎（MODE 开关），三主题 dark/light/black + 字号 normal/large。
> 换算律：包 CSS px @1280-1920 画布 ↔ 真机 dp = px ÷ 1.5（星愿 1920×1080 物理 = 1280×720dp）。

## 壳 token（两版同构，差异在交互深度）
| 项 | 包 px | car dp | 备注 |
|---|---|---|---|
| 顶栏高 | 88（≥1560→100） | 59（→67 大屏） | brand+tabs+header-actions+clock |
| 左面板宽 | 320（≥1560→380） | 213（→253） | radial 渐变底 #181818 |
| tab 字号 | 20 | 13.5 | 当前 tab 白+下划线 22×4 圆角 |
| 基字号 | 18 | 12 | 页面正文 |
| 页 padding | 26/32 | 17/21 | |
| 卡网格 | 3 列 gap20 aspect1.3 | car 980dp→3 列 306dp 卡 | aspect 1.3 横卡 |
| 面板封面 | aspect1 圆角12 阴影 | aspect 自适应 | hover 出 cover-expand |
| transport | 64/主76 圆 | 43/51 | |
| panel-tools | 3 列×62 高 | 3 列×41 | aria-pressed 绿 |
| next-up | 底锚 13px | 8.5dp | 下一首预告 |
| focus 播放页 | ambient blur90 暗+左封面右信息 56px 题 | CarPlayer 重排对齐 | |

## 主题（theme.js 移植）
- dark #121212/#1A1A1A/#232323 + #1ED760（真机已同源）
- light #F6F7F9 画布/白卡/深正文/深绿强调；black 纯黑 #000
- 顶栏日/月切换 + 设置→外观（三选卡+字号 normal/large）；持久化
- 真机落点：settings light 已有 → 扩 black + 字号档（外观设置页）

## 页面族（PAGES 注册表与现引擎同构）
home(feature 大卡 1.17:1 + recent 3 列 + grid3) / explore(源pills+标签) / boards(bgrid 2 列渐变188) / podcast(频道+top4) / medialibs(tile 快捷+lib 行) / 歌单 hero176 / 榜单详情 / 搜索(歌曲/歌手/专辑三分) / 设置(settings-grid 2 列卡) / 音源(source-row+开关) / 音效(eqrow) / 队列(drawer 抽屉) / focus 播放页 / 导入歌单 / 登录

## HD/CAR 差异点
- HD：header 级返回（data-page-back 注入 #headerBack）+ 键盘焦点（focus-visible 3px 环）
- CAR：行内 backlink 圆钮 56px；触控 48px+；800×480 降级面板 104px 迷你条

## 迁移顺序
1. car：CarShell/cartokens 按表重排 + 三主题+字号 → V40 星愿验
2. hd：HDMain 壳同构重做（web 先行，TV 保持侧栏到焦点适配）+ 主题
3. 逐页内容：feature 卡/榜单渐变/设置卡/音源行/队列抽屉
