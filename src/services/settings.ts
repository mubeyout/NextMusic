// 全局应用设置：MMKV 持久化 + 轻量订阅（跨组件响应）
// 注意：不要 import theme/tokens（tokens 反向依赖本模块做启动期主题，避免循环）
import { useState, useEffect } from 'react';
import { createMMKV } from 'react-native-mmkv';

const kv = createMMKV({ id: 'nextmusic-settings' });

export type Quality = '128k' | '320k' | 'flac';

export interface ProxyConf { enabled: boolean; type: 'http' | 'socks5'; host: string; port: string }

export interface AppSettings {
  // 播放
  playQuality: Quality;          // 默认播放音质（在线取链）
  autoplay: boolean;             // 打开歌曲自动播放
  gapless: boolean;              // 无缝播放（记录，暂不生效）
  volumeNormalize: boolean;      // 音量均衡（记录，暂不生效）
  // 下载
  wifiOnly: boolean;
  downloadQuality: Quality;
  maxConcurrent: number;         // 同时下载数
  // 外观（重启生效：启动时覆写 C token）
  pureBlack: boolean;
  accent: string;                // hex
  showTabLabels: boolean;
  // 启动
  startupPage: 'home' | 'explore' | 'my';
  restorePlayback: boolean;
  // 可视化
  vizStyle: 'wave' | 'spectrum' | 'circle';
  vizEnabled: boolean;
  vizColorful: boolean;
  // 备份
  autoBackup: boolean;
  backupPlaylists: boolean;
  backupHistory: boolean;
  backupSettings: boolean;
  // 代理（记录配置；生效需底层支持）
  proxy: ProxyConf;
  // 关于页：检查更新的元数据地址（update.json）
  updateUrl: string;
}

export const DEFAULTS: AppSettings = {
  playQuality: '320k',
  autoplay: true,
  gapless: true,
  volumeNormalize: false,
  wifiOnly: true,
  downloadQuality: '320k',
  maxConcurrent: 3,
  pureBlack: false,
  accent: '#1ED760',
  showTabLabels: true,
  startupPage: 'home',
  restorePlayback: false,
  vizStyle: 'spectrum',
  vizEnabled: true,
  vizColorful: true,
  autoBackup: false,
  backupPlaylists: true,
  backupHistory: false,
  backupSettings: true,
  proxy: { enabled: false, type: 'http', host: '', port: '' },
  updateUrl: '',
};

function load(): AppSettings {
  try { return { ...DEFAULTS, ...JSON.parse(kv.getString('settings') || '{}') }; } catch { return { ...DEFAULTS }; }
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
