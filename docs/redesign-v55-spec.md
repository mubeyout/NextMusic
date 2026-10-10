# 库族重设计 v5.5 施工规格（KAI 自基准稿提取 10-10）

基准稿: NextMusic-design/docs/mockups/library-redesign-v2.html (545行)
线上对照: op.mubey.top:41715/library-redesign-v2.html?openclaw_portal=e88dc220...
验收: LEO 持稿逐项(功能实测+图标审计)

## 老板追加令(优先级最高)
1. **自适应布局=硬规则**: 定宽卡+自然换行(不按卡数压宽度)/phone-HD双规格/容器不写死宽
2. **播放页也换真盘**(LEO清单③"播放页不改"作废) — ✅批1已上线
3. **只换黑胶唱片,封面保留嵌盘心** — ✅批1已上线
4. 添加入口=媒体库页＋,不在侧栏(老板13:24)

## 设计令牌(基准稿CSS)
- 色板: bg#05070A app#0B0D10 card#12151A line#1E2228 t1#F2F4F6 t2#B7BDC4 t3#7E858D
- 主色 green#1ED760 gold#F0C75E blue#5B8DEF warm#FF9F6E
- 英雄卡渐变: gold(#8a6d2f→#c9a24d→#e8cf8a) violet(#4a3a8f→#6f5bc4→#9d8fe0) green(#1a6b45→#2aa05f→#5fd894) teal(#16697a→#2a9db3→#6fd0dd) blue(#2a4a8f→#4a72c9→#89a9e8) sunset(#8f4a2a→#c97a3d→#e8b06f)
- 品牌渐变: emby(#5b9146→#78b357→#a5d98b) nas(#3a5a8f→#5578b8→#8faee0) tingfeng(#8f5a3a→#c9894a→#e8c08a)
- 英雄卡: r16 pad22/24 minH170 统计在卡内(big 19/800 + st 12.5 + mini 10.5) + 54px播放钮(hover变绿) + glow装饰圆
- duo双入口: pri(绿底)+gho(描边) 高36
- 封面网格: 基准稿7列(1250px下5列) — **实现按自适应硬规则: 定宽卡+自然换行**(phone 2列)
- 歌曲列表: 次级区 listhead(标题/专辑/时长)+srow 46h(封面34/标题歌手/专辑/时长)+A-Z索引条
- 状态点: 正常green/警告warm + 辉光

## 四屏规格
### ①云曲库v3 (CloudLibraryScreen)
- phead: 标题+账号·配额% + 状态点(正常/警告) + 右上图标钮(上传/存储明细)
- 英雄卡: gold=播放全部(N首·容量·仅云端+mini昨日上传/剩余配额) + violet=最近上传(昨天N首·M专辑)
- duo: 播放全部(整库)+随机播放(不重复)
- 专辑封面网格(真数据 albums) + 歌曲列表次级+A-Z

### ②本地曲库v3 (ServerLocalLibraryScreen/LocalLibBrowse)
- phead: 库名+路径·上次扫描(新增N) + 就绪点 + 右上(重新扫描pri/多选)
- 英雄卡: green=播放全部(统计) + teal=随机漫步
- duo同上 + 最近添加封面网格 + 批量条(已选N:播放/下一首/加队列/收藏/上传云曲库金)
- 歌曲列表+视图切换(全部/专辑墙/文件夹)+A-Z

### ③公共曲库v3 (PublicLibraryScreen)
- phead: 标题+本周新增·官方共享 + 源状态点(2/3源正常) + 右上源管理
- 英雄卡: blue=播放全部 + sunset=随机播放
- 双栏: 左(最近更新4列网格+源筛选chips+歌曲列表) 右(side5热门Top10 — 服务端播放计数端点未暴露,降级或用recent数据)
- 已有: 播放全部/A-Z/宫格计数(a376383) — v3主要补英雄卡

### ④第三方单源页v5 (ProviderBrowse)
- 英雄卡: 品牌渐变(名称+统计+mini连接信息+播放钮) + violet小卡(最新入库)
- duo + 能力芯片caps(万能取链/服务端转码/相似电台/收藏打星/播放上报/歌单同步/进度同步dim — 随源显隐) + 音质档qrow(128/192/256/320/无损)
- 维度tabs(专辑/艺人/歌单/收藏/文件夹/电台dim — 按源能力) + 最新入库封面网格(Items/Latest)
- 页尾添加画廊(未连源品牌卡); 添加入口=媒体库页＋不在侧栏
- 特殊态: WebDAV/听风NAS无搜索态(文件夹优先+建立本地索引引导) / Plex订阅限制提示 / 飞牛道理鱼漫游四态芯片

### ⑤侧栏(HD) Part A 缩进树
- 我的乐库组: 媒体库父项 + 缩进子行: 本机曲库们/云曲库/各第三方源(品牌png 16px)/公共曲库
- 品牌标: src/assets/brands/*.png 13源(Icon.tsx BRAND_PNG require垫片已接)

## API依据 (music-api-hub/docs/)
- 能力映射表(基准稿mtx): 取链/转码/相似电台/scrobble/进度同步/Latest/HLS/文件夹直读/漫游/自动落库/扫码配对 — 每行带端点
- api-inventory.md / platform-api.md / media-server-api.md 等九篇
- 增量序: 先六已接源(emby/jellyfin/navidrome/subsonic/webdav/tingfeng), Songloft/群晖/飞牛/道理鱼/ABS后续批

## 图标
- UI图标一律bootstrap fill路径(SVG use/symbol模式)
- 真品牌标=brands/*.png(blogo 16/28/32tile)
- 审计: icon-graphics-standard/scripts/audit_graphics.py — **路径未找到,已问LEO**

## 真实功能要求(老板原话"真实功能活页面")
- 双入口真播放: 各源取链端点+队列洗牌
- 封面网格真数据: 各源 albums/Latest 端点
- 状态点/统计真值: 既有 stats/quota/scan 端点

## 构建部署链(每日验证过)
tsc → vite build(HD) → tar|docker cp→/server/public/music/ → APP_FLAVOR=phone build → cp→music-phone/ → docker commit → git push
坑: dist属主/脱敏层/phone构建后回建HD/EACCES chown 1000:1000
