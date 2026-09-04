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
