// 桌面 polyfills：必须在一切主仓模块 import 之前执行（appversion 等在模块加载期读原生）
import { NativeModules, DeviceEventEmitter } from 'react-native';
// RN 源码里的 require('./x.png') 静态资产引用（Metro 专有；vite/ESM 浏览器环境无 require）——
// 映射到 vite 构建产物 URL。未知 id 抛错便于发现新增触点。
import markUrl from '../../src/assets/brand/mark.png';
import autoeqPack from '../../src/assets/autoeq_pack.json';
import brandEmby from '../../src/assets/brands/emby.png';
import brandJellyfin from '../../src/assets/brands/jellyfin.png';
import brandNavidrome from '../../src/assets/brands/navidrome.png';
import brandWebdav from '../../src/assets/brands/webdav.png';
import brandPlex from '../../src/assets/brands/plex.png';
import brandAbs from '../../src/assets/brands/audiobookshelf.png';
import brandSyn from '../../src/assets/brands/audiostation.png';
import brandDaoliyu from '../../src/assets/brands/daoliyu.png';
import brandMstream from '../../src/assets/brands/mstream.png';
import brandSongloft from '../../src/assets/brands/songloft.png';
import brandFeiniu from '../../src/assets/brands/feiniu.png';
const ASSET_URLS: Record<string, string> = {
  'mark.png': markUrl,
  'brands/emby.png': brandEmby,
  'brands/jellyfin.png': brandJellyfin,
  'brands/navidrome.png': brandNavidrome,
  'brands/webdav.png': brandWebdav,
  'brands/plex.png': brandPlex,
  'brands/audiobookshelf.png': brandAbs,
  'brands/audiostation.png': brandSyn,
  'brands/daoliyu.png': brandDaoliyu,
  'brands/mstream.png': brandMstream,
  'brands/songloft.png': brandSongloft,
  'brands/feiniu.png': brandFeiniu,
};
const ASSET_MODULES: Record<string, unknown> = { 'autoeq_pack.json': autoeqPack };
(globalThis as { require?: unknown }).require = (id: string): unknown => {
  if (typeof id === 'string') {
    for (const [k, url] of Object.entries(ASSET_URLS)) {
      if (id.endsWith(k)) return { uri: url }; // RNW Image source {uri};Android Metro 返回 asset number,不受影响
    }
    for (const [k, mod] of Object.entries(ASSET_MODULES)) {
      if (id.endsWith(k)) return mod; // JSON 数据包(soundfx autoeq)
    }
  }
  throw new Error('[desktop] require() 不支持的模块: ' + String(id));
};

// 形态 = HD（车机/TV 横版 UI，桌面同构）；后续可细分 desktop 差异
const NM = NativeModules as Record<string, unknown>;
NM.AppVersionInfo = { versionName: '1.2.10', versionCode: 94, flavor: 'hd' };

// 原生能力占位（空对象：调用处已有 undefined 防御/try-catch；NativeEventEmitter 空对象在 RNW 宽松）
for (const m of ['NMScanner', 'NMDownloader', 'BlurModule', 'AppRestart', 'VersionModule']) {
  if (NM[m] === undefined) NM[m] = {};
}


// ---------- 投屏（老板 09-14：桌面版保留投屏，真实现） ----------
// 发现/控制在主进程（UDP 组播/TLS 只能在 Node 侧）；此处把 nmDesktop IPC 桥回 NMDlna/NMCast 接口。
// 事件：主进程 webContents.send → onCastEvent → DeviceEventEmitter（=NativeEventEmitter 的全局总线）
type CastBridge = { cast: (kind: 'dlna' | 'cast', method: string, ...args: unknown[]) => Promise<{ ok: boolean; r?: unknown; error?: string }>; onCastEvent: (cb: (channel: string, payload: unknown) => void) => () => void };
const nmDesk = (globalThis as never as Record<string, CastBridge | undefined>).nmDesktop;
const castCall = async (kind: 'dlna' | 'cast', method: string, ...args: unknown[]) => {
  if (!nmDesk) throw new Error('no desktop bridge');
  const res = await nmDesk.cast(kind, method, ...args);
  if (!res.ok) throw new Error(res.error || 'cast error');
  return res.r;
};
if (nmDesk) {
  nmDesk.onCastEvent((channel, payload) => DeviceEventEmitter.emit(channel, payload));
  // AirPlay 仅 mac(老板 09-14):win/linux 不注入,available=false 自动降级
  if ((nmDesk as never as { platform?: string }).platform === 'darwin') {
    NM['NMAirplay'] = {
      startDiscovery: () => { void nmDesk.cast('airplay', 'startDiscovery'); },
      stopDiscovery: () => { void nmDesk.cast('airplay', 'stopDiscovery'); },
      cast: (...a: unknown[]) => castCall('airplay', 'cast', ...a) as Promise<boolean>,
      play: () => Promise.resolve(false),
      pause: (...a: unknown[]) => castCall('airplay', 'pause', ...a).catch(() => false) as Promise<boolean>,
      stop: (...a: unknown[]) => castCall('airplay', 'stop', ...a).catch(() => false) as Promise<boolean>,
      seek: () => Promise.resolve(false),
      getPosition: (...a: unknown[]) => castCall('airplay', 'getPosition', ...a).catch(() => ({ pos: 0, dur: 0, state: 'STOPPED' })) as Promise<{ pos: number; dur: number; state: string }>,
      getVolume: (...a: unknown[]) => castCall('airplay', 'getVolume', ...a).catch(() => 50) as Promise<number>,
      setVolume: (...a: unknown[]) => castCall('airplay', 'setVolume', ...a).catch(() => false) as Promise<boolean>,
    };
  }
  NM['NMDlna'] = {
    startDiscovery: () => { void nmDesk.cast('dlna', 'startDiscovery'); },
    stopDiscovery: () => { void nmDesk.cast('dlna', 'stopDiscovery'); },
    probeTcp: (targets: unknown) => castCall('dlna', 'probeTcp', typeof targets === 'string' ? JSON.parse(targets) : targets).then((r) => JSON.stringify(r ?? [])),
    cast: (...a: unknown[]) => castCall('dlna', 'cast', ...a) as Promise<boolean>,
    play: (...a: unknown[]) => castCall('dlna', 'play', ...a).catch(() => false) as Promise<boolean>,
    pause: (...a: unknown[]) => castCall('dlna', 'pause', ...a).catch(() => false) as Promise<boolean>,
    stop: (...a: unknown[]) => castCall('dlna', 'stop', ...a).catch(() => false) as Promise<boolean>,
    seek: (...a: unknown[]) => castCall('dlna', 'seek', ...a).catch(() => false) as Promise<boolean>,
    getPosition: (...a: unknown[]) => castCall('dlna', 'getPosition', ...a) as Promise<{ pos: number; dur: number; state: string }>,
    getVolume: (...a: unknown[]) => castCall('dlna', 'getVolume', ...a).catch(() => 50) as Promise<number>,
    setVolume: (...a: unknown[]) => castCall('dlna', 'setVolume', ...a).catch(() => false) as Promise<boolean>,
  };
  NM['NMCast'] = {
    startDiscovery: () => { void nmDesk.cast('cast', 'startDiscovery'); },
    stopDiscovery: () => { void nmDesk.cast('cast', 'stopDiscovery'); },
    cast: (...a: unknown[]) => castCall('cast', 'cast', ...a) as Promise<boolean>,
    play: (...a: unknown[]) => castCall('cast', 'play', ...a).catch(() => false) as Promise<boolean>,
    pause: (...a: unknown[]) => castCall('cast', 'pause', ...a).catch(() => false) as Promise<boolean>,
    stop: (...a: unknown[]) => castCall('cast', 'stop', ...a).catch(() => false) as Promise<boolean>,
    seek: (...a: unknown[]) => castCall('cast', 'seek', ...a).catch(() => false) as Promise<boolean>,
    getPosition: (...a: unknown[]) => castCall('cast', 'getPosition', ...a) as Promise<{ pos: number; dur: number; state: string }>,
    getVolume: (...a: unknown[]) => castCall('cast', 'getVolume', ...a).catch(() => 50) as Promise<number>,
    setVolume: (...a: unknown[]) => castCall('cast', 'setVolume', ...a).catch(() => false) as Promise<boolean>,
  };
}
// v1.1.8 老方案(无桥 no-op)已由上面的真实现取代;非 Electron 壳时 NMDlna/NMCast 保持 undefined,
// audioroute.ts 的 available=false 守卫自动降级(不进空对象循环、不炸 Route 页)
if (NM['NMAudioRoute'] === undefined || Object.keys(NM['NMAudioRoute'] as object).length === 0) {
  NM['NMAudioRoute'] = {
    getOutputDevices: () => Promise.resolve({ devices: [{ id: -1, name: '本机扬声器', kind: 'speaker' }], preferred: -1 }),
    selectDevice: () => Promise.resolve(true),
    getMusicVolume: () => Promise.resolve(Math.round((((globalThis as never as Record<string, unknown>).__nmAudio as { volume?: number } | undefined)?.volume ?? 1) * 100)),
    setMusicVolume: (pct: number) => {
      const a = (globalThis as never as Record<string, unknown>).__nmAudio as { volume?: number } | undefined;
      if (a) a.volume = Math.max(0, Math.min(1, pct / 100));
      return Promise.resolve(pct);
    },
  };
}
// 桌面音效 DSP 桥：soundfx.ts → NM.SoundFx.setConfig → audio-pro shim 的 WebAudio 链(EQ/混响/3D)
NM['SoundFx'] = {
  setConfig: (cfg: { eq?: number[]; reverb?: { id: string; mainGain: number; sendGain: number }; panner?: { enable: boolean; speed: number; distance: number } }) => {
    const f = (globalThis as never as Record<string, unknown>).__nmFxSet as ((c: typeof cfg) => void) | undefined;
    if (f) f(cfg);
  },
};
