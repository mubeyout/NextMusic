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
};

// ---------- DLNA ----------

export const dlna = {
  available: !!D,
  startScan: () => D?.startDiscovery(),
  stopScan: () => D?.stopDiscovery(),
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
