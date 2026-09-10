// 全局应用设置：MMKV 持久化 + 轻量订阅（跨组件响应）
// 注意：不要 import theme/tokens（tokens 反向依赖本模块做启动期主题，避免循环）
import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

const kv = createMMKV({ id: 'nextmusic-settings' });

export type Quality = '128k' | '320k' | 'flac';

export interface AppSettings {
  // 播放
  playQuality: Quality;          // 默认播放音质（在线取链）
  // 下载
  downloadQuality: Quality;
  maxConcurrent: number;         // 同时下载数
  downloadDir: 'public' | 'custom';  // vc84：public=公共音乐目录(默认) / custom=SAF 自选目录
  downloadTreeUri: string;      // custom 模式 SAF tree uri
  // 外观（重启生效：启动时覆写 C token）
  pureBlack: boolean;
  accent: string;                // hex
  light: boolean;                // 浅色主题（桌面 Web 同款浅色盘）
  uiScale: string;               // HD 界面缩放档位(90%/100%/110%/125%,重启生效)
  showTabLabels: boolean;
  // 启动
  startupPage: 'home' | 'explore' | 'my';
  restorePlayback: boolean;
  // 备份
  backupPlaylists: boolean;
  backupHistory: boolean;
  backupSettings: boolean;
  // 关于页：检查更新的元数据地址（update.json）
  updateUrl: string;
  sourceCatalogUrl: string;  // vc87：音源目录页（一键同步更新用）
  // ===== lxserver 原版播放器设置全量对齐（v2 DEFAULT_SETTINGS 同构） =====
  itemsPerPage: number;                 // 每页条数(20,'all'=全部)
  defaultEntry: string;                 // 默认入口: search|songlist|leaderboard|favorites|localmusic
  enablePublicSources: boolean;         // 显示公开源
  enableProxyPlayback: boolean;         // 播放走代理
  enableProxyDownload: boolean;         // 下载走代理
  enableAutoProxy: boolean;             // 自动代理
  enableCustomProxy: boolean;           // 自定义代理
  customProxyUrl: string;               // 代理模板({url} 占位)
  enableOnlyDownloadMode: boolean;      // 仅下载模式
  hotSearchLimit: number;               // 热搜数量
  lyricFontSize: number;                // 歌词字号倍数
  lyricFontFamily: string;              // 歌词字体
  switchPlaylistOnSearchPlay: boolean;  // 搜索播放切换队列
  switchPlaylistOnSongListPlay: boolean;// 歌单播放切换队列
  showSidebarSongInfo: boolean;         // 侧栏封面
  enableCrossfade: boolean;             // 淡入淡出
  keepScreenAwake: boolean;             // 屏幕常亮
  enableKeyboardShortcuts: boolean;     // 键盘快捷键
  showLyricTranslation: boolean;        // 歌词翻译
  showLyricRoma: boolean;               // 歌词罗马音
  swapLyricTransRoma: boolean;          // 交换翻译/罗马音
  autoCompactPlaybar: boolean;          // 自动精简控制栏
  enableAutoSwitchSource: boolean;      // 自动换源
  enableAutoSwitchApiSource: boolean;   // 自动解析换源
  enableAutoSkipOnError: boolean;       // 失败自动下一曲
  enableAutoDegradeQuality: boolean;    // 自动降低音质
  playbackErrorPriority: string;        // 失败处理优先级 platform,quality,next
  enablePreloader: boolean;             // 预读下一首
  enableSmtcLyric: boolean;             // SMTC 歌词(桌面)
  showFooterVisualizer: boolean;        // 底部可视化
  footerVisualizerStyle: string;        // bars|pulse|...
  showDetailVisualizer: boolean;        // 播放页可视化
  detailVisualizerStyle: string;
  visualizerOpacity: number;
  visualizerGlobalStyle: string;
  enableServerCache: boolean;           // 服务器缓存歌曲
  enableServerLyricCache: boolean;      // 服务器歌词缓存
  embedLyricToFile: boolean;            // 下载嵌入歌词
  serverCacheLocation: string;          // data|root
  serverCacheNamingPattern: string;     // simple|standard
  enableRemaster: boolean;              // 下载目录洗版
  enableLyricCache: boolean;            // 本地歌词缓存
  enableSongUrlCache: boolean;          // 链接缓存
  enableLyricGlow: boolean;             // 歌词荧光
  enablePersistentToken: boolean;       // 持久化 Token
  playerBackground: string;             // 播放页背景 blur|solid|dark
  saveAccountSettingsToFile: boolean;   // 账号设置存文件
  autoUpdateNetworkList: boolean;       // 自动更新网络歌单
  networkListAutoCheckInterval: string; // 检测间隔 6h
  favoriteSidebarOrder: string[];       // 收藏侧栏排序
  preferServerCache: boolean;           // 优先缓存播放
  remoteSyncUrl: string;                // 远程同步地址
  remoteSyncCode: string;               // 远程同步连接码
  enableClientModeSync: boolean;        // 客户端模式同步
  lastRemoteSyncMode: string;           // 上次远程同步模式
  deduplicatePlaylistByQuality: boolean;// 同 ID 歌曲仅最高音质
}

// lx34 清理：autoplay/gapless/volumeNormalize/viz*/autoBackup/proxy/wifiOnly 无真实实现，选项与存储键一并移除；
// 旧备份/旧持久化里的多余键在 load 合并时无害残留，不迁移。

export const DEFAULTS: AppSettings = {
  playQuality: '320k',
  downloadQuality: '320k',
  maxConcurrent: 3,
  downloadDir: 'public',
  downloadTreeUri: '',
  pureBlack: false,
  accent: '#1ED760',
  light: false,
  uiScale: Platform.OS === 'web' ? '125%' : '100%', // 桌面默认 125%(老板定),CSS zoom 生效;原生重启生效
  showTabLabels: true,
  startupPage: 'home',
  restorePlayback: true, // 全端默认开：冷启动恢复队列+当前曲（暂停态），点播放才取链续播——不卡启动、不丢上下文（lx45）
  backupPlaylists: true,
  backupHistory: false,
  backupSettings: true,
  updateUrl: '',
  sourceCatalogUrl: '',
  // ===== v2 默认值(与原版 DEFAULT_SETTINGS 逐项一致) =====
  itemsPerPage: 20,
  defaultEntry: 'favorites',
  enablePublicSources: true,
  enableProxyPlayback: false,
  enableProxyDownload: false,
  enableAutoProxy: true,
  enableCustomProxy: false,
  customProxyUrl: '',
  enableOnlyDownloadMode: true,
  hotSearchLimit: 20,
  lyricFontSize: 1.25,
  lyricFontFamily: '',
  switchPlaylistOnSearchPlay: true,
  switchPlaylistOnSongListPlay: true,
  showSidebarSongInfo: false,
  enableCrossfade: true,
  keepScreenAwake: true,
  enableKeyboardShortcuts: true,
  showLyricTranslation: true,
  showLyricRoma: false,
  swapLyricTransRoma: false,
  autoCompactPlaybar: true,
  enableAutoSwitchSource: true,
  enableAutoSwitchApiSource: true,
  enableAutoSkipOnError: true,
  enableAutoDegradeQuality: true,
  playbackErrorPriority: 'platform,quality,next',
  enablePreloader: true,
  enableSmtcLyric: true,
  showFooterVisualizer: true,
  footerVisualizerStyle: 'bars',
  showDetailVisualizer: false,
  detailVisualizerStyle: 'pulse',
  visualizerOpacity: 0.5,
  visualizerGlobalStyle: 'blocks',
  enableServerCache: true,
  enableServerLyricCache: true,
  embedLyricToFile: true,
  serverCacheLocation: 'root',
  serverCacheNamingPattern: 'simple',
  enableRemaster: false,
  enableLyricCache: true,
  enableSongUrlCache: true,
  enableLyricGlow: true,
  enablePersistentToken: false,
  playerBackground: 'blur',
  saveAccountSettingsToFile: true,
  autoUpdateNetworkList: false,
  networkListAutoCheckInterval: '6h',
  favoriteSidebarOrder: [],
  preferServerCache: true,
  remoteSyncUrl: '',
  remoteSyncCode: '',
  enableClientModeSync: false,
  lastRemoteSyncMode: 'merge_remote_local',
  deduplicatePlaylistByQuality: true,
};

function load(): AppSettings {
  try {
    const merged = { ...DEFAULTS, ...JSON.parse(kv.getString('settings') || '{}') } as AppSettings;
    if (merged.downloadDir !== 'custom') merged.downloadDir = 'public'; // vc84：默认公共;历史 private 归一
    if (kv.getString('lx45m') !== '1') { merged.restorePlayback = true; kv.set('lx45m', '1'); } // lx45：历史用户从未动过此开关也视默认开（老安装存量 false 覆盖新默认）
    return merged;
  } catch { return { ...DEFAULTS }; }
}

let current: AppSettings = load();
const listeners = new Set<() => void>();

export const settings = {
  get(): AppSettings { return current; },
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    current = { ...current, [key]: value };
    kv.set('settings', JSON.stringify(current));
    listeners.forEach(fn => fn());
  },
  patch(p: Partial<AppSettings>) {
    current = { ...current, ...p };
    kv.set('settings', JSON.stringify(current));
    listeners.forEach(fn => fn());
  },
};

export function onSettings(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export function useSettings(): AppSettings {
  const [s, setS] = useState(current);
  useEffect(() => {
    const fn = () => setS(settings.get());
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return s;
}

// 外观 token 覆写已迁移到 theme/tokens.ts 的 applyBootTheme()（模块加载期执行，早于一切 StyleSheet.create）
// 运行时切换主题：改设置后需重启应用（RestartModule）才作用于已固化的样式

export const QUALITY_LABEL: Record<Quality, string> = {
  '128k': '128k 标准',
  '320k': '320k 高品质',
  'flac': 'FLAC 无损',
};
