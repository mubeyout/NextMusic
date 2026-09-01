import { NativeModules, NativeEventEmitter, EmitterSubscription } from 'react-native';

/**
 * 音频输出路由 + DLNA 投屏（lx31）
 * - NMAudioRoute：本机输出设备枚举/切换（DefaultAudioSink.setPreferredDevice）、系统媒体音量
 * - NMDlna：SSDP 发现 + AVTransport/RenderingControl SOAP 控制
 */

const R = NativeModules.NMAudioRoute as {
  getOutputDevices(): Promise<{ devices: LocalDevice[]; preferred: number }>;
  selectDevice(id: number): Promise<boolean>;
  getMusicVolume(): Promise<number>;
  setMusicVolume(pct: number): Promise<number>;
} | undefined;

const D = NativeModules.NMDlna as {
  startDiscovery(): void;
  stopDiscovery(): void;
  probeTcp(json: string): Promise<string>;
  cast(dev: DlnaDevice, url: string, title: string, artist: string): Promise<boolean>;
  play(dev: DlnaDevice): Promise<boolean>;
  pause(dev: DlnaDevice): Promise<boolean>;
  stop(dev: DlnaDevice): Promise<boolean>;
  seek(dev: DlnaDevice, sec: number): Promise<boolean>;
  getPosition(dev: DlnaDevice): Promise<{ pos: number; dur: number; state: string }>;
  getVolume(dev: DlnaDevice): Promise<number>;
  setVolume(dev: DlnaDevice, vol: number): Promise<boolean>;
} | undefined;

export type LocalDevice = {
  id: number;
  name: string;
  kind: 'speaker' | 'wired' | 'usb' | 'bluetooth';
};

export type DlnaDevice = {
  uuid: string;
  name: string;
  controlUrl: string;
  rcUrl?: string;
};

export type DlnaPosition = { pos: number; dur: number; state: string };

export type CastDevice = { uuid: string; name: string; host: string; port: number };

// ---------- 本机设备 / 音量 ----------

export const audioRoute = {
  available: !!R,
  /** 真实输出设备列表 + 当前用户偏好（-1 跟随系统） */
  getDevices: (): Promise<{ devices: LocalDevice[]; preferred: number }> =>
    R?.getOutputDevices() ?? Promise.resolve({ devices: [], preferred: -1 }),
  /** 应用内切换输出设备；id=-1 恢复系统自动路由 */
  selectDevice: (id: number): Promise<boolean> => R?.selectDevice(id) ?? Promise.resolve(false),
  getVolume: (): Promise<number> => R?.getMusicVolume() ?? Promise.resolve(0),
  setVolume: (pct: number): Promise<number> => R?.setMusicVolume(pct) ?? Promise.resolve(0),
  /** 系统音量变化（硬件音量键等） */
  onVolumeChange(cb: (pct: number) => void): EmitterSubscription | undefined {
    if (!R) return;
    return new NativeEventEmitter(NativeModules.NMAudioRoute).addListener('nm.volume', (e: any) => cb(e as number));
  },
  /** 设备插拔 / 蓝牙连接变化 */
  onDevicesChange(cb: () => void): EmitterSubscription | undefined {
    if (!R) return;
    return new NativeEventEmitter(NativeModules.NMAudioRoute).addListener('nm.devices', () => cb());
  },
  /** 1.0.5：路由被系统抢走（ColorOS MDM 二路蓝牙上线抢路由）——原生哨兵连续两次比对不符后通知，
   *  JS 应 rebuildAudio 重建 AudioTrack（新 track 初始化自动重放设备偏好） */
  onRouteStolen(cb: (e: { preferred: number; actual: number }) => void): EmitterSubscription | undefined {
    if (!R) return;
    return new NativeEventEmitter(NativeModules.NMAudioRoute).addListener('nm.route.stolen', (e: any) => cb(e));
  },
};

// ---------- DLNA ----------

export const dlna = {
  available: !!D,
  startScan: () => D?.startDiscovery(),
  stopScan: () => D?.stopDiscovery(),
  /** TCP 直连探活（lx42 兜底）：传入 [{host,port}] 返回可达下标数组 */
  probeTcp: (targets: Array<{ host: string; port: number }>): Promise<number[]> =>
    D ? D.probeTcp(JSON.stringify(targets)).then(s => JSON.parse(s) as number[]).catch(() => []) : Promise.resolve([]),
  onFound(cb: (dev: DlnaDevice) => void): EmitterSubscription | undefined {
    if (!D) return;
    return new NativeEventEmitter(NativeModules.NMDlna).addListener('dlna.found', (e: any) => cb(e as DlnaDevice));
  },
  onScanEnd(cb: () => void): EmitterSubscription | undefined {
    if (!D) return;
    return new NativeEventEmitter(NativeModules.NMDlna).addListener('dlna.scanEnd', () => cb());
  },
  cast: (dev: DlnaDevice, url: string, title: string, artist: string): Promise<boolean> =>
    D ? D.cast(dev, url, title, artist) : Promise.reject(new Error('no DLNA')),
  play: (dev: DlnaDevice) => (D ? D.play(dev) : Promise.resolve(false)),
  pause: (dev: DlnaDevice) => (D ? D.pause(dev) : Promise.resolve(false)),
  stop: (dev: DlnaDevice) => (D ? D.stop(dev) : Promise.resolve(false)),
  seek: (dev: DlnaDevice, sec: number) => (D ? D.seek(dev, sec) : Promise.resolve(false)),
  getPosition: (dev: DlnaDevice): Promise<DlnaPosition> =>
    D ? D.getPosition(dev) : Promise.reject(new Error('no DLNA')),
  getVolume: (dev: DlnaDevice): Promise<number> => (D ? D.getVolume(dev) : Promise.resolve(50)),
  setVolume: (dev: DlnaDevice, vol: number) => (D ? D.setVolume(dev, vol) : Promise.resolve(false)),
};

// ---------- Google Cast（Chromecast built-in）----------

const G = NativeModules.NMCast as {
  startDiscovery(): void;
  stopDiscovery(): void;
  cast(dev: CastDevice, url: string, title: string, artist: string, contentType: string): Promise<boolean>;
  play(dev: CastDevice): Promise<boolean>;
  pause(dev: CastDevice): Promise<boolean>;
  stop(dev: CastDevice): Promise<boolean>;
  seek(dev: CastDevice, sec: number): Promise<boolean>;
  getPosition(dev: CastDevice): Promise<{ pos: number; dur: number; state: string }>;
  getVolume(dev: CastDevice): Promise<number>;
  setVolume(dev: CastDevice, pct: number): Promise<boolean>;
} | undefined;

/** Cast 内容类型：从 URL 扩展名推断（Chromecast 按声明选解码器） */
export function castMimeOf(url: string): string {
  const m = /\.(mp3|m4a|aac|flac|wav|ogg|opus|mka|ts)(?:[?#]|$)/i.exec(url);
  if (!m) return 'audio/mpeg';
  switch (m[1].toLowerCase()) {
    case 'm4a': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    case 'flac': return 'audio/flac';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    case 'opus': return 'audio/opus';
    default: return 'audio/mpeg';
  }
}

export const googleCast = {
  available: !!G,
  startScan: () => G?.startDiscovery(),
  stopScan: () => G?.stopDiscovery(),
  onFound(cb: (dev: CastDevice) => void): EmitterSubscription | undefined {
    if (!G) return;
    return new NativeEventEmitter(NativeModules.NMCast).addListener('cast.found', (e: any) => cb(e as CastDevice));
  },
  onScanEnd(cb: () => void): EmitterSubscription | undefined {
    if (!G) return;
    return new NativeEventEmitter(NativeModules.NMCast).addListener('cast.scanEnd', () => cb());
  },
  onLost(cb: () => void): EmitterSubscription | undefined {
    if (!G) return;
    return new NativeEventEmitter(NativeModules.NMCast).addListener('cast.lost', () => cb());
  },
  cast: (dev: CastDevice, url: string, title: string, artist: string): Promise<boolean> =>
    G ? G.cast(dev, url, title, artist, castMimeOf(url)) : Promise.reject(new Error('no Cast')),
  play: (dev: CastDevice) => (G ? G.play(dev) : Promise.resolve(false)),
  pause: (dev: CastDevice) => (G ? G.pause(dev) : Promise.resolve(false)),
  stop: (dev: CastDevice) => (G ? G.stop(dev) : Promise.resolve(false)),
  seek: (dev: CastDevice, sec: number) => (G ? G.seek(dev, sec) : Promise.resolve(false)),
  getPosition: (dev: CastDevice): Promise<DlnaPosition> =>
    G ? G.getPosition(dev) : Promise.reject(new Error('no Cast')),
  getVolume: (dev: CastDevice): Promise<number> => (G ? G.getVolume(dev) : Promise.resolve(50)),
  setVolume: (dev: CastDevice, vol: number) => (G ? G.setVolume(dev, vol) : Promise.resolve(false)),
};
