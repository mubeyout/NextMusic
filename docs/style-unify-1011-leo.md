# 样式视觉统一 · LEO 评审与改动清单 — 2026-10-11（老板令 1011 15:07 / KAI 派工）

> 基准（未动）：HomeScreen / ExploreScreen / docs/design-tokens.md / SP·FS token
> 硬约束遵守：未改逻辑/props/数据流/路由；HDMain.tsx 与 navigation.tsx 零触碰；未部署未提交
> 验证：`tsc --noEmit` 两轮 **0 错**（EXIT 0；本地 node+项目自带 typescript 6.0.3，限内存 1.3G。执行环境无 docker 二进制——KAI 验收时请按原命令用宿主 docker 复跑双保险）

## 一、全局层（跨屏统一）

| 项 | 结果 |
|---|---|
| ④ 裸 fontSize → FS | **527 处**归档（含碎片归并 8/9/9.5/10.5→xs、11.5→body、12.5/13.5→md、14.5→lg、15.5→xl） |
| ③ 裸 gap → SP | **399 处**归档（2/3→xs、5/7→sm、9→lg、11→xl、13→xxl、15→wide、17→section、19→wider 等） |
| 颜色收口 → C | **61 处**：#FF6B6B/#E8618C→C.danger（新增 token，与 hdtokens 同值）、#04120a/#0b0f0d→C.onBrand、状态点 #3FBF7F→C.brand/#8A8F98→C.text3、'#999'→C.text2、#4A4A4A→C.strokeStrong、color 白→C.white、开关钮白→C.knob；#FF9B9B/#FF8A80 错误字→C.danger |
| emoji 灭绝 | MyLibrary 🔒→Icon shield(ScopeChip 加 icon 视觉 prop)；Downloads/SourcesAccount ⚠→Icon shield+C.danger。✓/♪/♥ 为单色文本符号且 ActionSheet 为 string 接口（不可动 props），保留 |
| import 修补 | 批量插入 FS/SP import；修复 16 个 HD 文件 hdtokens-C 与 theme-C 双 import 命名冲突（theme 侧去 C 留 FS/SP） |
| token 源补充 | theme C +danger；hdtokens C +strokeStrong/knob（各一处，浅色覆写已同源） |

### 档外值裁定（字号规范 12 档之外的处置，全部带行内注释）
- 26→FS.display(24)：Auth/AuthSignup 大标题、ArtistDetail avaGlyph、MyScreen plGlyph、PlayerScreen 歌词当前行（lineHeight 31→29 同步）
- 25/30（HDPlayer 歌名 native/web）→ display/hero；22→h1(20)：编辑页 title×2、HDMy secTitle、MediaLibs pheadNameHD；22→display(24)：HDBoot 品牌字、HDPlayer 歌词高亮行、HDSearch 头像兜底
- **特排保留**（FS 封顶 hero=28，强归破坏视觉）：coverGlyph 40 / artistInitial 44 / glyph 32（兜底大字）；HDSongRow 徽标微字 7×2；gap 40(HD 登录双列)/28/56(HDPlayer 控制区/分栏)
- HDPlayer 浅色覆写值(#F6F7F9/#26282C 系)保留：StyleSheet 启动期一次性求值，写死浅色值是既有设计（token 化会在深色启动用户切浅色时出错）
- 渐变遮罩白透明系(#ffffffcc/b3/99/26/0f)保留：C 无对应档，逐个归并视觉风险大于收益（记录在案，后续可立 token）

## 二、重点人工改动（①②⑤）

1. **已知遗留·歌手圆卡不一致**：SearchScreen allArtistCard(76 容器/64 头像/无卡影)与 PublicLibrary ArtistCircle(72) → 统一 **76(HD 96) 圆、artTint2 兜底+C.brandText 首字母(FS.headline)、useHoverCard 弥散影+hover**；专辑卡 104 同步 nm-card 化（surface 底/r12/封面+文字区，RailCard 同构）
2. **PublicLibrary 遗留碎片**：randName 10.5/randSub 9/acName 12/artInit 17/artInitBig 24 等 → FS token；playAllT '#04120a'→C.onBrand
3. **MyLibrary ScopeChip**：🔒 emoji → 真矢量 shield icon（chip 内 row 对齐）
4. SourcesAccount 服务器音源错态条：⚠ emoji → shield icon + row 布局 + C.danger
5. Downloads 失败卡：⚠ emoji → shield icon + C.danger

## 三、逐屏清单（screens 37 文件 + hd 16 文件；FS/SP 数字=机械归档数，其余为同文件附带修复）

| 页面 | 发现 → 改动 |
|---|---|
| AlbumDetail | 裸字号 4/gap2 → token |
| AlbumFav | 2/3 → token |
| ArtistDetail | 6/3 + avaGlyph 26→display |
| ArtistFav | 4/1 → token |
| Auth / AuthSignup / AuthLogin | 标题 26→display（AuthLogin 原已 h1 精致档保持）；token 27/15 |
| BoardsSquare | 5/4 → token |
| Boot | 9/6 → token |
| CloudLibrary | 0/2（批次1 已净）；'#04120a'×2→onBrand、状态点→brand/text3 |
| Comments | 15/5 → token |
| DeviceMusic | 6/5 → token |
| Downloads | 6/1 + ⚠→shield+C.danger、failTitle 色→danger |
| Fx | 27/15 + knob 白→C.knob |
| Help | 4/1 → token |
| ImportPlaylist | 21/7 + ghost 描边 #4A4A4A→strokeStrong |
| License | 10/5 → token |
| LocalLibrary | 23/14 → token |
| LocalLibraryEdit | 21/12 + title 22→h1 |
| MediaLibs | 2/10（批次1 已净）+ pheadNameHD 22→h1、状态点色→brand/text3 |
| MyFavorites | 7/2 → token |
| MyLibrary | 0/1（批次1 已净）+ ScopeChip 🔒→shield |
| MyScreen | 18/12 + plGlyph 26→display |
| Player | 13/7 + 歌词当前行 26→display |
| PlaylistDetail | 10/8 + '#999'→text2；coverGlyph 40 特排保留 |
| ProviderDetail | 14/10 + 兜底字 44/32 特排保留 |
| ProviderEdit | 36/27 + title 22→h1 |
| PublicLibrary | 5/2 + 歌手圆卡 72→76 与搜索页统一、碎片归档、'#04120a'→onBrand、errT '#E8618C'→danger |
| Route | 11/2 → token |
| Search | 16/18 + **歌手/专辑卡 nm-card 化**（本次最大单屏人工改动） |
| ServerLocalLibrary | 20/14 → token |
| Server | 12/5 → token |
| SettingSub | 4/3 → token |
| Settings | 5/2 → token |
| SourcesAccount | 35/11 + ⚠→shield+row、hintErr→danger |
| UploadSheet | 15/4 + '#0b0f0d' 系→onBrand |
| HD：HDActions/HDBoards/HDCollect/HDDiscover/HDGrid(未列,零裸字)/HDHome/HDPodcast | 各 2-4/4-13 → token（HD 族页边距 26/段距 18 已是基准态，未动） |
| HDAuthLogin | 16/11；gap 40 特排保留（双列表单大列距） |
| HDBoot | 6/4 + 品牌字 22→display、ghost 描边→strokeStrong |
| HDFx | 4/15 + tgKnob 白→knob |
| HDMy | 7/9 + secTitle 22→h1 |
| HDPlayer | 36/22 + 歌名 25/30→display/hero、歌词高亮 22→display；浅色覆写值与 gap 28/56 特排保留 |
| HDPlaylistDetail | 1/7 → token |
| HDSearch | 9/27 + 头像兜底 22→display、白字→C.white |
| HDSettings | 4/10 → token |
| HDSongRow | 0/4；徽标微字 7×2 特排保留 |
| WebLyricCardModal | 8/6 → token（fontSize:1.0 为配置对象非样式，未动） |

## 四、验收建议
1. KAI 宿主 docker 复跑 tsc（我这边无 docker，本地 tsc 6.0.3 两轮 0 错）
2. 视觉冒烟重点：搜索页歌手/专辑 rail（新卡影）、公共库歌手 rail（+4px）、Auth/编辑页标题（26→24、22→20）、播放页歌词行（26→24）
3. 碎片归并的 ±0.5-1px 变化属规范既定行为；档外特排共 9 处均有行内注释可 grep `[LEO 1011]` 复核

## 五、追加轮 1011 15:30-15:45（老板实测反馈修复）

1. **专辑墙对齐探索（老板令「全部按照探索的来」）**
   - 新建共享组件 `src/components/GridWall.tsx`：HD/web=HDGrid 自适应密网格（探索 HDDiscover 同款 min=128×缩放，等宽整行）；phone=百分比三列（与 Home/Explore 歌单网格同大小）
   - MediaLibsScreen 4 处墙（综合页 mine/recs/tops + 专辑 tab 墙）、ProviderDetailScreen 艺人页专辑墙 → 全部接入 GridWall；cell 规约 phone '31%' / HD '100%'（albumCellFill）
   - GridBasis 默认档最低档 48%两列→31%三列；DiscCard 内联档位同步
2. **浅色模式白图标**：全库扫描 Icon 白色硬编码（props 白色/样式白/C.white/白透明系）+ 逐一核对容器底色——仅 HDFxScreen 返回钮是真 bug（surface 可变底+白图标白字）→ C.text2；其余白图标均在恒深底（渐变/brand/danger/错误兜底页）安全保留
3. **浅色侧边导航字色太浅（HDMain 样式区，未碰路由）**：navLabel/plName text2→text（层级靠字重 500/700+brandDim 底）；group/pbTime text3→text2；NavItem 未激活图标与工具钮图标 text2→text
4. tsc 复跑 0 错（EXIT 0）

遗留建议（需老板定夺）：text3 作为全局辅助色在浅色下对比 3:1 偏弱（与桌面版 :root 同源值）——若要整体提深需与桌面版同步改 token，本轮未动。
