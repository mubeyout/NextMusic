# NextMusic

多源音乐播放 App。React Native + Kotlin 原生音频层,一个人听歌的全套方案。

## 功能概览

- **多源搜索/榜单**:酷我 / 酷狗 / 网易 / QQ音乐 / 咪咕 五源搜索与榜单广场,LX 音源引擎 WebView 沙箱隔离运行
- **流媒体媒体库**:Subsonic / Navidrome / 道理鱼 / Emby / Jellyfin / WebDAV 六类服务器接入,专辑-艺术家-歌曲-歌单四段浏览,断链歌自动兜底与复活
- **投屏**:DLNA + Chromecast(CASTV2 纯局域网实现,不依赖 GMS)
- **音频 DSP**:10 段 EQ + 真 IR 卷积混响(WAV 解析 + partitioned FFT)+ 3D 声像 + 变调,与 LX Server 音效配置互通
- **本地**:下载管理队列、设备音乐扫描、已下载优先离线播放
- **其他**:歌词同步高亮、播客电台、SAF 备份导入导出、MMKV 全量设置持久化

## 技术栈

- React Native(New Architecture)+ TypeScript
- `react-native-audio-pro`(经 `scripts/patch-audiopro.mjs` 补丁注入原生 DSP)
- Android:media3/ExoPlayer、MediaBrowserService、OkHttp 原生下载模块
- 发布链:GitHub Releases + update.json(jsDelivr CDN 主源 / raw 备源),见 [nextmusic-release](https://github.com/mubeyout/nextmusic-release)

## 构建

```sh
cd android
JAVA_HOME=<jdk21> ./gradlew assembleRelease --no-daemon
# 产物: android/app/build/outputs/apk/release/app-release.apk
```

版本号在 `android/app/build.gradle`(`versionCode` 单调递增,App 靠它与 update.json 比对触发更新)。

## 版本

当前:3.4.0-lx44(vc60)。完整更新日志见 Releases 仓库。

## 目录速查

- `src/services/lxapi.ts` — LX 引桥(搜索/取链/歌词)
- `src/services/providers.ts` — 六类媒体库协议实现
- `src/services/soundfx.ts` — 音效配置存储与服务器同步
- `src/services/player*` — 播放状态机与投屏路由
- `android/.../SoundFxEngine.kt` — 原生 DSP(EQ/IR/声像)
- `scripts/patch-audiopro.mjs` — audio-pro 补丁(DSP 注入/错误竞态修复等)
