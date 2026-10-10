# NextMusic 全页面响应式与分端适配审计报告

> 审计日期：2026-10-10 ｜ 方式：静态代码走查（只审不改）｜ 工作区：`/mnt/sda1/Works/tmp-nm-rel`
> 依据：老板纲领（曲库内页布局失调为重灾区；按端特点排版；功能一样界面/交互/动效可不一样）＋ 已立自适应硬规则（宽度自适应优先于形态硬切 / 定宽卡+自然换行 / phone·HD 双规格）

---

## 0. 形态体系事实（审计前提，影响定级）

- `IS_HD` = **构建期 flavor**（`src/services/appversion.ts:19`：hd 包 / web `APP_FLAVOR=hd`）。桌面 web 恒 HD flavor，可自由缩放窗口——**HD flavor 也会遇到窄窗**，这是「宽度自适应优先于形态硬切」规则的直接原因。
- phone 壳（RouteScreen）只跑 phone 屏：HomeScreen / ExploreScreen / MyScreen / SearchScreen / PlayerScreen 等；HD 壳（HDMain）跑 HD* 屏。**跨形态共享屏**（内部自带 IS_HD 分支）：PublicLibraryScreen、MyLibraryScreen、MediaLibsScreen、ServerLocalLibraryScreen、ProviderDetailScreen、LocalLibraryScreen、PlaylistDetailScreen、QueueScreen、MyFavoritesScreen、ImportPlaylist、FxScreen(TV 经 withPhoneScale 缩放)。
- 已有正确的自适应基元，但**未在曲库墙推广**：
  - `src/hd/HDGrid.tsx`：onLayout 实测宽算列数（minmax(min,1fr) 等价）✅
  - PublicLibraryScreen:61 `recBasis`：winW 分档 flexBasis（1100→4列 / 720→3列 / 窄→2列）✅
  - MediaLibsScreen:1354 `cardHD flexBasis:375`：定宽卡+自然换行 ✅
  - HomeScreen:136 `cardW = (width-40-12)/2` ✅
- 统一 token 已存在：`GUTTER=22`、`pageBottom()`、`focus()`（`src/hd/hdstyle.ts`）。

---

## 一、重灾区 🔴（曲库内页族，先审先修）

### 🔴 1. 曲库详情页头失调族（老板点名核心）

**1a. 公共曲库·专辑详情 PublicLibAlbumRoute**

| 项 | 内容 |
|---|---|
| 文件:行 | `src/screens/PublicLibraryScreen.tsx:558-585`（头卡 559，样式 albHead ~767） |
| 问题 | ① 头卡用 `DiscCard`（宽固定 `31%`，见 1e）作封面——HD/web 1920px 窗下封面约 **550px 巨图** 对一行小字，phone 平板横屏约 240px 也失衡；② 右侧 `<View style={{ flex: 1 } as never}>` **缺 `minWidth:0`**，长中文专辑名挤压换行失控；③ `albSub`（歌手·N首·公共曲库）**无 numberOfLines**，长歌手名整段折行顶飞播放按钮；④ `paddingBottom: 40` 固定（558）——无 mini player 让位（同页浏览页是 `140+insets.bottom`），尾部歌曲行被播放条盖住；⑤ 无 HD 规格头（封面/字号/间距全 phone 值）、无宽窗内容限宽 |
| 建议修法 | 头卡独立组件：封面定宽（phone 120 / HD 160-200）+ 右栏 `flex:1, minWidth:0` + 标题 numberOfLines={2} + 副行 numberOfLines={1}；底部统一 `pageBottom(40)`（phone 侧补 mini player 让位 token）；HD 宽窗给内容区 maxWidth（如 1160）或双栏（歌曲列表+侧卡） |
| 优先级 | **P0**（巨图挤压=布局失调本体） |
| 工作量 | M |

**1b. 公共曲库·歌手详情 PublicLibArtistRoute**

| 项 | 内容 |
|---|---|
| 文件:行 | `src/screens/PublicLibraryScreen.tsx:601-636`（头卡 602） |
| 问题 | 与 1a 同款四连（31% 圆形巨封面 / flex:1 无 minWidth / albSub 无截断 / paddingBottom 40 at 601）；歌手页专辑墙 `d.wall` 同为 31% DiscCard 墙（617） |
| 建议修法 | 同 1a；专辑墙随 1e 一并换自适应列 |
| 优先级 | **P0** |
| 工作量 | M |

**1c. 我的曲库·专辑详情 MyLibAlbumRoute**

| 项 | 内容 |
|---|---|
| 文件:行 | `src/screens/MyLibraryScreen.tsx:611-630`（头卡 612，paddingBottom 40 at 611） |
| 问题 | 与 1a 完全同款（同族复制粘贴）：31% 头封面 / `flex:1 as never` 无 minWidth / albSub 无 numberOfLines / 无 mini player 让位 / 无 HD 头规格 |
| 建议修法 | 抽「曲库详情头」共享组件（1a/1b/1c/1d 四处一次收口） |
| 优先级 | **P0** |
| 工作量 | M（四路由合一后边际递减） |

**1d. 我的曲库·歌手详情 MyLibArtistRoute**

| 项 | 内容 |
|---|---|
| 文件:行 | `src/screens/MyLibraryScreen.tsx:654-690`（头卡 655，paddingBottom 40 at 654） |
| 问题 | 同 1b 同款；album 墙 31% |
| 建议修法 | 同上 |
| 优先级 | **P0** |
| 工作量 | M |

**1e. 根因：DiscCard 固定 31% 三列墙（全库族共用）**

| 项 | 内容 |
|---|---|
| 文件:行 | `src/screens/MyLibraryScreen.tsx:717`（`disc: { width: '31%' }`）；墙容器 713-716；HD 覆盖仅改 gap/padding（714/716）**不改列数** |
| 波及面 | 我的曲库专辑墙(386)/歌手墙(402)；公共曲库 albums/artists tab（PublicLibraryScreen 713/715 + 使用点 339/363）；服务器本地曲库墙（ServerLocalLibraryScreen:581 `grid`）；本机曲库墙（LocalLibraryScreen:510/511）；全部详情页头（1a-1d） |
| 问题 | 三列百分比定宽：HD/web 1920px→**单卡约 550px 巨封面**、2560px→790px；phone flavor 平板/横屏 800px→240px 大卡；窄窗 320px→96px 偏小。列数不随实测宽变化，直接违反「宽度自适应优先」硬规则；且**按形态硬切**（wallHD 只调 gap）也不满足 HD 规格预期（HD 应更多列+更紧凑） |
| 建议修法 | DiscCard 支持 `basis` prop 或墙容器换自适应：优先复用/泛化 `HDGrid`（onLayout 实测宽→列数，min 卡宽 phone≈110 / HD≈150），或按 PublicLibraryScreen:61 recBasis 模式 flexBasis 分档（窄2/中3-4/宽5-6/HD 更密）。一次改动全库族受益 |
| 优先级 | **P0**（重灾区根因，单点修复波及六屏） |
| 工作量 | L（组件+六屏接线+回归） |

### 🔴 2. 第三方媒体库浏览页 ProviderBrowseScreen（MediaLibsScreen 内）

| 项 | 内容 |
|---|---|
| 文件:行 | `src/screens/MediaLibsScreen.tsx:1323-1324`（`albumCell 31%` / `albumCellWeb 15.5%`）；使用点：专辑维度全量墙（~1128）、听风我的歌单/推荐/排行展开网格（~970/1005/1040） |
| 问题 | ① **平台硬切非宽度自适应**：web（含 HD flavor 与 TV）恒 15.5%=6 列——窄窗（<700px）卡片仅 ~70-100px，字 12px 换行挤压；phone flavor 平板/横屏恒 31%=3 列巨卡；② 31% 与 15.5% 之间无中间档（800-1000px 窗口两形态观感割裂）；③ 违反已立硬规则 |
| 建议修法 | 换宽度分档（winW 或 onLayout）：≤480→2-3列 / ≤760→4列 / ≤1100→5列 / 更宽→6-8列；或定宽卡（如 150/180）+自然换行（听风歌单卡建议定宽制，与 hub 卡 375 同哲学） |
| 优先级 | **P0**（老板点名的第三方深层视图；窄窗挤压+平板巨列双重失调） |
| 工作量 | M |

附带（同屏）：

| # | 文件:行 | 问题 | 建议修法 | 优先级 | 工作量 |
|---|---|---|---|---|---|
| 2b | MediaLibsScreen.tsx:445-455 | 自管理 `window.resize` 监听（注释：RNW Dimensions 不可靠）——与全库 `useWindowDimensions` 模式不统一，两套真相源 | 若 RNW 修复则统一；否则抽 `useWinW()` hook 共享 | P2 | S |
| 2c | MediaLibsScreen.tsx:1419-1429 | `davCols/sidePanel/sideBtn…` 双区样式已定义**未接线**（davWide 仅预留注释），死样式债 | 接线桌面双区或删除；列表区已有 listWrapWeb maxWidth 860 ✅ | P2 | S |
| 2d | MediaLibsScreen.tsx:930-935 | phead 头 `pheadSub` numberOfLines=1 ✅ / `pheadName flexShrink:1` ✅ ——健康（正面记录） | — | — | — |
| 2e | WebDAV 目录浏览（625-760） | 行式列表健康：minWidth:0 ✅ numberOfLines ✅ PressCard tvFocus/HD 行高 ✅ 面包屑横滚 ✅（正面基线，可作为其他行式列表范本） | — | — | — |

### 🔴 3. 第三方详情页 ProviderDetailScreen

| 项 | 内容 |
|---|---|
| 文件:行 | `src/screens/ProviderDetailScreen.tsx:230/234`（albumCell 31% / albumCellWeb 15.5%，注释自认「此前 31% 在桌面=3 巨列」——只修了一半） |
| 问题 | 与 2 同款平台硬切：web 窄窗 6 列小卡、phone 平板 3 巨列；artist 专辑网格是本屏主内容 |
| 建议修法 | 同 2（宽度分档/定宽卡）；与 MediaLibsScreen 共用同一实现（两处样式本就是复制） |
| 优先级 | **P0**（同族同修） |
| 工作量 | M |

附带（同屏）：

| # | 文件:行 | 问题 | 建议修法 | 优先级 | 工作量 |
|---|---|---|---|---|---|
| 3b | ProviderDetailScreen.tsx:146-166 | headCard：`headMeta` 无 `minWidth:0`；`stat`（N 首 · 账号名）无 numberOfLines，长账号名折行 | headMeta 加 minWidth:0 + stat numberOfLines={2} | P1 | S |
| 3c | ProviderDetailScreen.tsx:145,152 | `PageHeader title=""` 空标题占位且置于 ScrollView **内**（他页在滚动区外）→ 返回键随滚动消失 + contentContainer 与 PageHeader 双重 paddingHorizontal（返回键缩进 ~40px，与全局不齐） | 头移出滚动区或去掉内层 PageHeader 用统一头 | P2 | S |
| 3d | ProviderDetailScreen.tsx:110-120 | 播放全部 46/48 高 ✅ 动作行 56/60 ✅ prog 定宽 38 ✅（正面） | — | — | — |
| 3e | ProviderDetailScreen.tsx:203-210 | 歌单全量 `songs.map`（ScrollView 无虚拟化），大歌单（500+）长列表卡顿 | FlatList/分页（低优先，观感可用） | P2 | M |

### 🔴 4. 服务器本地曲库 ServerLocalLibraryScreen

| # | 文件:行 | 问题 | 建议修法 | 优先级 | 工作量 |
|---|---|---|---|---|---|
| 4a | ServerLocalLibraryScreen.tsx:581（`grid`）+ 470-495 | 专辑/歌手墙 = DiscCard 31% 墙（同 1e），HD/web 巨卡 | 随 1e 统一换自适应列 | **P0** | 随 1e |
| 4b | ServerLocalLibraryScreen.tsx:301+419-440 | songs 视图一次拉 `size=2000` 全量渲染进普通 ScrollView（无分页/虚拟化/字母分组独立块）——大库（1000+首）低端 TV/车机滚动掉帧、首帧长阻塞 | 降首屏 size+「加载更多」或 FlatList 窗口化（已有字母分组可配 AzIndex） | **P1**（性能型挤爆） | M |
| 4c | ServerLocalLibraryScreen.tsx:541 | `hdTitle textAlign:'center'` 违反 lx166 全局标题居左统一（PageHeader/其他 hdHead 均居左） | 改居左 | P1 | S |
| 4d | ServerLocalLibraryScreen.tsx:567 | ManageView `miniBtn 32px` < 44 触摸标准（phone） | ≥40px 或 hitSlop | P2 | S |
| 4e | ServerLocalLibraryScreen.tsx:186-198 | 表单 inputRow flex ✅ checkLine numberOfLines ✅ 扫描卡 flex 布局 ✅（正面） | — | — | — |
| 4f | ServerLocalLibraryScreen.tsx:447+ | BrowseView phone 侧 PageHeader ✅、AzIndex 定位含 insets.top ✅（正面） | — | — | — |

### 🔴 5. 本机曲库 LocalLibraryScreen（LocalLibBrowse）

| # | 文件:行 | 问题 | 建议修法 | 优先级 | 工作量 |
|---|---|---|---|---|---|
| 5a | LocalLibraryScreen.tsx:510/511 + 385-405 | 歌手墙/专辑墙 = DiscCard 31% 墙（同 1e） | 随 1e | **P0** | 随 1e |
| 5b | LocalLibraryScreen.tsx:225-275（drill 头） | 下钻页自绘头：返回 26px 触区、标题 minWidth:0 ✅、playAllBtn ~36px 高（<44） | 触区补 hitSlop/加高 | P2 | S |
| 5c | LocalLibraryScreen.tsx:282-300（home 区）+ 470+ | 首页化区+FolderPane 面包屑横滚 ✅ dirRow numberOfLines ✅ paddingBottom insets+120 ✅（正面基线） | — | — | — |
| 5d | LocalLibraryScreen.tsx 全屏 | 无桌面宽窗双区（与我的/公共曲库不同构）——HD flavor 满幅单列观感一般 | 可选：≥900 双区（对齐 MyLibrary wideCols） | P2 | M |

---

## 二、常规屏位（约 40 屏走查）

### phone 壳 tab 屏（phone flavor 专属；HD 壳不加载）

**HomeScreen**（`src/screens/HomeScreen.tsx`）

| # | 行 | 问题 | 建议 | 优先级 | 工作量 |
|---|---|---|---|---|---|
| H1 | 489（plCell 31%）+117 | 推荐歌单格固定三列百分比：横屏/平板 phone flavor 3 巨卡 | recBasis 分档或定宽卡 | P1 | S |
| H2 | 454（paddingBottom 24） | 滚动区尾部无 mini player 让位（他屏 116/140）——尾部歌曲行/卡片被播放条盖住 | 统一让位 token | P1 | S |
| H3 | 136/376 | carlink 快捷卡 `cardW` 随窗宽 ✅（正面范本） | — | — | — |
| H4 | 459 | overlayCard 350 + maxWidth 100% ✅ | — | — | — |

**ExploreScreen**（`src/screens/ExploreScreen.tsx`）

| # | 行 | 问题 | 建议 | 优先级 | 工作量 |
|---|---|---|---|---|---|
| E1 | 78（card 31%） | 歌单卡固定三列（同 H1） | 同 H1 | P1 | S |
| E2 | 556（boardCell 48.5%）/545（catCard 48%+flexGrow） | 榜单 2 列半自适应（flexGrow 兜底 ✅）；窄窗 48% ≈150px 尚可 | 可保留 | P2 | S |
| E3 | 562（overlay top:146 固定） | 状态浮层按设计稿固定 y，小屏/转屏可能压内容 | 改百分比或 insets 相对 | P2 | S |
| E4 | 108-124（TopRow） | t.meta flex:1+minWidth:0 ✅ 双行截断 ✅（正面） | — | — | — |

**MyScreen**（`src/screens/MyScreen.tsx`）

| # | 行 | 问题 | 建议 | 优先级 | 工作量 |
|---|---|---|---|---|---|
| M1 | 417（plCell 31%）+222 | 我的歌单格固定三列（同 H1） | 同 H1 | P1 | S |
| M2 | 153-374 | IS_HD 仅用于 dialog 通道切换（hdActions）✅；phone 壳内合理 | — | — | — |

**SearchScreen**（`src/screens/SearchScreen.tsx`）——基本健康

- 定宽横滑卡 allArtistCard 76 / allAlbumCard 104 ✅（符合定宽卡+自然换行精神）；chipText maxWidth 160 ✅；overlayCard maxWidth 420 ✅；paddingBottom insets.bottom+140 ✅；AzIndex 接线 ✅。P2：无（通过）。

**PlayerScreen**（`src/screens/PlayerScreen.tsx`，phone 专属）

| # | 行 | 问题 | 建议 | 优先级 | 工作量 |
|---|---|---|---|---|---|
| P1 | 339（vinyl 270 固定） | 大屏 phone flavor（平板/折叠展开）唱片偏小、小屏 320 恰好；无窗宽联动 | width = min(winW*0.72, 320) 类自适应 | P2 | S |
| P2 | 130/146/228 | insets top/bottom ✅（正面） | — | — | — |

### 跨形态共享屏

**QueueScreen**：`src/screens/QueueScreen.tsx:78` paddingBottom 24 固定——队列行尾部被 mini player/底栏遮（phone）；IS_HD 分支 ✅。P1/S。

**PlaylistDetailScreen**：paddingBottom `current?116:32` ✅；hdActions 分端弹窗 ✅。头卡/列表抽查未见挤压（numberOfLines 齐全）。P2 通过（未逐行，低风险）。

**CloudLibraryScreen**：`entryCard flexBasis 48%` / `entryCardHD 375`（819/820）✅ 定宽+自然换行合规；delCard 88%/maxWidth 380 ✅。P2 通过。

**MyFavoritesScreen**：GUTTER/pageBottom/IS_HD 三件套 ✅ 全合规（正面基线）。

**AlbumFavScreen / ArtistFavScreen**：行式+IS_HD 焦点 ✅；ArtistFavScreen:42 `paddingBottom 24` 无 mini player 让位（同队列问题）。P1/S（两处）。

**AlbumDetailScreen**（桥接屏）

| # | 行 | 问题 | 建议 | 优先级 | 工作量 |
|---|---|---|---|---|---|
| A1 | 45（paddingBottom 40） | 同详情族无让位 | 统一 token | P1 | S |
| A2 | 60-70（cover 110 固定 / head flex:1 无 minWidth） | 无 HD 规格（HD 上 110px 小封面+phone 字号）；meta 有 numberOfLines ✅ 风险低 | 头卡共享组件（随 1a 批次）补 HD 规格+minWidth:0 | P2 | S |
| A3 | 70（favBtn ~32px 高） | 触摸目标 <44 | 加高/hitSlop | P2 | S |

**ArtistDetailScreen**（桥接屏）

| # | 行 | 问题 | 建议 | 优先级 | 工作量 |
|---|---|---|---|---|---|
| R1 | 49（paddingBottom 40） | 同 A1 | P1 | S | |
| R2 | 102-106（albumCard 104 定宽+wrap） | 定宽自然换行 ✅ 合规，但无 HD 规格（HD 上 104px 小卡+上限 12 张） | HD 档 150-180 定宽（双规格） | P2 | S |
| R3 | 66（meta 无 numberOfLines） | 长源名+统计折行 | numberOfLines={1} | P2 | S |

**FxScreen**：modeCell 31%（640）音效模式 3 列 / revChip 23%（676）混响 4 列——phone 可用；TV 经 withPhoneScale 缩放显示 phone 布局（非原生 HD 排版，接受度待老板定）；web HD 走 HDFxScreen（maxWidth 860 ✅）。P2。

**设置族**（SettingsScreen/SettingSubScreens/HelpScreens/LicenseScreen）：SubPage/SettingRows maxWidth 860 居中 ✅、GUTTER/pageBottom ✅ —— 健康。
**认证族**（AuthLogin/AuthSignup/ServerScreen）：maxWidth 470 居中 ✅ —— 健康。
**SourcesAccountScreens**：maxWidth 1280 ✅。**ProviderEditScreen**：maxWidth 860+表单 460 ✅ 健康。**ImportPlaylist**：IS_HD GUTTER ✅。**UploadSheet**：92%/480、HD 560 ✅。**CommentsScreen**：insets+输入栏底 ✅。**DeviceMusicScreen**：insets.bottom+120 ✅。**DownloadsScreen/BoardsSquareScreen**（行式/48.5% 两列）：低风险通过；Boards 无 insets（浮层语境可接受）。**LocalLibraryEditScreen**：insets ✅ 但**无 IS_HD**——HD 侧「编辑配置」入口可达，进入是 phone 布局（padding 16、控件 phone 尺寸）。P2/M（补 GUTTER+大触点或 HD 包一层）。

---

## 三、HD 屏族（src/hd/）

| 屏 | 结论 | 备注 |
|---|---|---|
| HDMain | ✅ | 侧栏壳+内容栈；内页 Fx web→HDFxScreen、TV→withPhoneScale(FxScreen) 分端正确 |
| HDHome | ✅ 基线 | HDGrid（min≈126×字号比）自适应列 ✅；横滑定宽卡 148/96 ✅ |
| HDSearch | ✅ | 定宽横滑卡 168/90 ✅ |
| HDSongRow | ✅ 基线 | minWidth:0 ✅ numberOfLines ✅ hover 区 34→96 展开 ✅（web hover 分端范本） |
| HDPlaylistDetail | ✅ | cover 128 + web stretch ✅；pageBottom ✅ |
| HDPlayer | ✅ | web 唱片列 45% / TV 344 分端 ✅ |
| HDFxScreen | ✅ | maxWidth 860 ✅ |
| HDAuthLogin | ✅ | cols maxWidth 760+flexWrap ✅ |
| WebLyricCardModal | ✅ | canvas 逐 token 换行+超限缩字号（lxfix 已修）✅ |
| HDBoards/HDPodcast/HDCollect/HDMy/HDBootScreen | 通过 | 定宽卡/行式，未见百分比墙与挤压模式 |

---

## 四、共享组件（src/components/）

| 组件 | 结论 | 问题/建议 | 优先级 |
|---|---|---|---|
| SongRow.tsx | ✅ 基线 | minWidth:0+双行截断+Pressable focusable ✅。P2：行尾 cloud 角标有无会跳宽度（抖动）；dur 无 fontVariant 对齐（components 版 vs HDSongRow 有） | P2 |
| AzIndex.tsx | ✅ | 实测高映射 ✅ HD 可聚焦字母 ✅ phone 拖动 ✅ | — |
| LibraryHome.tsx | ✅ 基线 | HeroPair onLayout≥640 堆叠 ✅（硬规则范本）；RailCard 定宽 ✅；LibBanner minWidth:0 ✅。P2：HeroCard 无分端进入动效（phone Animated/HD CSS 均缺） | P2 |
| PageChrome.tsx | ✅ | insets ✅ HD GUTTER ✅ 居左统一 ✅ | — |
| HDTouch.tsx | ✅ 基线 | TV 焦点环/web hover+pressScale 分端实现范本 ✅ | — |
| Dialog.tsx | ✅ | card maxWidth 320 / toast 300 ✅ | — |
| MyLibraryScreen 内 SongRow（库内版） | ⚠️ | 与 components/SongRow 并存两套：库内版 AnimatedTouchableOpacity **不可聚焦**（HD D-pad 到不了曲库歌曲行）；sub 无 lib 限宽但 sgMid minWidth:0 ✅ | P1 |

---

## 五、P0 清单（挤爆/失调，立即修）

1. **DiscCard 31% 墙族**（`MyLibraryScreen.tsx:717` 根因）：HD/web/宽窗巨卡（1920px→~550px 封面）。波及我的曲库墙、公共曲库墙、服务器本地曲库墙、本机曲库墙、四详情页头。→ 泛化 HDGrid/flexBasis 分档，一次修复六屏。【L】
2. **曲库详情页头失调**（`PublicLibraryScreen.tsx:559/602`、`MyLibraryScreen.tsx:612/655`）：31% 头封面 + flex:1 缺 minWidth:0 + 副行无截断。→ 抽「详情头」共享组件（定宽封面 phone120/HD160-200 + 截断三件套）。【M】
3. **第三方网格 31%↔15.5% 平台硬切**（`MediaLibsScreen.tsx:1323`、`ProviderDetailScreen.tsx:230`）：web 窄窗 6 列 ~70px 小卡 / phone 平板 3 巨列，且违反「宽度自适应优先于形态硬切」。→ 宽度分档列数或定宽卡。【M】
4. **ServerLocalLibrary BrowseView 墙同 1**（`ServerLocalLibraryScreen.tsx:581`）：随 1 修复。【随批次】

P0 边缘高危（建议随批）：详情路由/桥接屏 `paddingBottom:40`、HomeScreen `paddingBottom:24` 的 mini player 遮挡（操作断，定 P1 但修复极廉）。

---

## 六、按文件聚合修复批次

| 批次 | 文件 | 内容 | 规模 |
|---|---|---|---|
| A 自适应墙 | MyLibraryScreen(DiscCard/墙)+PublicLibraryScreen+ServerLocalLibraryScreen+LocalLibraryScreen | 泛化 HDGrid→共享 AdaptiveWall（实测宽分档列，phone/HD 双 min 卡宽）；详情页头封面改定宽 | L（P0 核心） |
| B 第三方网格 | MediaLibsScreen+ProviderDetailScreen | albumCell 宽度分档（两文件复制样式合一） | M |
| C 详情头组件 | PublicLibraryScreen×2 路由+MyLibraryScreen×2 路由(+AlbumDetail/ArtistDetail 桥接屏顺带) | 「曲库详情头」组件：定宽封面+minWidth:0+numberOfLines+HD 规格 | M |
| D 底部让位 token | PublicLibraryScreen(558/601)+MyLibraryScreen(611/654)+AlbumDetail(45)+ArtistDetail(49)+HomeScreen(454)+QueueScreen(78)+ArtistFav(42)+AlbumFav | phone 侧 mini player 让位统一 token（对齐 HD pageBottom 哲学） | S |
| E phone tab 网格 | HomeScreen(489)+MyScreen(417)+ExploreScreen(78) | plCell 31%→宽度分档/定宽 | S |
| F HD 焦点补漏 | PublicLibraryScreen(homeBlock 表行/榜单行 230-260/268-280)+MyLibraryScreen(库内 SongRow) | HD 侧换 HDTouch/可聚焦（D-pad 可达） | M |
| G 大列表性能 | ServerLocalLibraryScreen(301,2000 首全量)+ProviderDetailScreen(歌单全量) | 分页+FlatList 窗口化 | M |
| H 杂项打磨 | hdTitle 居中(541)、死样式(davCols 族)、PageHeader 双 padding(ProviderDetail 145)、miniBtn/触区 32px 族、LocalLibraryEdit HD 规格、Fx TV 原生化(可选) | 各 S 级零碎 | S×n |

---

## 七、系统性模式提炼

1. **「31% 三列墙」是全库族的共同根因**——百分比定宽在 2015 年手机上成立，在 HD flavor 可缩放窗口/平板 phone flavor 上必然失调。代码库已有三个正确范本（HDGrid / recBasis / 定宽 375 hub 卡）却未推广；**修一处组件=修六屏**，是本次整改最高杠杆点。
2. **形态硬切残留**：`IS_WEB ? 15.5% : 31%`（MediaLibs/ProviderDetail）与 `wallHD 只改 gap`（MyLibrary/PublicLibrary）都是按平台/形态切，而非按实测宽切。统一改为「宽度分档（实测宽）× phone/HD 双规格（字号/触点/间距）」两层正交：宽度管列数，形态管密度。
3. **详情页头四处复制粘贴**（PublicLib×2 + MyLib×2 + 桥接屏×2 变体）导致同一失调 ×6——组件化后一次性消灭，且未来新库页不再复发。
4. **底部让位无 token**：HD 侧已有 `pageBottom()` 收口，phone 侧 40/24/116/120/140 五种写法并存。补 phone 版 token（mini player 高度）即可批量修掉「尾部遮挡」家族。
5. **两套 SongRow 并存**（components/ 版可聚焦 vs MyLibrary 库内版不可聚焦）：HD D-pad 可达性在曲库歌曲行断裂。建议收敛到 components/SongRow 或给库内版补 focusable。
6. **正面基线**（可作整改参照）：WebDAV 行式列表（minWidth+截断+tvFocus+HD 行高）、HeroPair（onLayout 640 阈值堆叠）、hd 卡 375 定宽+自然换行、HDTouch（TV 环/web hover 分端）、HDSongRow（hover 区展开）——这些就是「功能一样、界面/交互/动效分端」的现成答案，整改时直接复用其模式。
7. **动效分端现状**：phone Animated（DiscCard 弹簧/SkelWall 脉冲）✅、web hover/pressScale ✅、TV 焦点环/zoom ✅；缺的是 HD 墙卡进入动效与 HeroCard 转场（P2 打磨项，非断线）。
8. **安全区**：抽查屏幕 insets 覆盖良好；缺失集中在浮层/桥接屏（Boards/Queue/AlbumFav 族），多因「浮层语境」可接受，但底部让位缺失放大了其实际影响（见 D 批次）。

---

*审计方法说明：重灾区六屏逐行精读；常规屏以 grep 信号（百分比宽/flexBasis/maxWidth/useWindowDimensions/onLayout/numberOfLines/insets/IS_HD/paddingBottom）+ 关键段精读覆盖，未逐行屏标注「通过/低风险」。所有行号基于当前工作区 HEAD。*
