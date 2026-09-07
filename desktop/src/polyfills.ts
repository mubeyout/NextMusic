// 桌面 polyfills：必须在一切主仓模块 import 之前执行（appversion 等在模块加载期读原生）
import { NativeModules } from 'react-native';
// RN 源码里的 require('./x.png') 静态资产引用（Metro 专有；vite/ESM 浏览器环境无 require）——
// 映射到 vite 构建产物 URL。未知 id 抛错便于发现新增触点。
import markUrl from '../../src/assets/brand/mark.png';
import autoeqPack from '../../src/assets/autoeq_pack.json';
import brandEmby from '../../src/assets/brands/emby.png';
import brandJellyfin from '../../src/assets/brands/jellyfin.png';
import brandNavidrome from '../../src/assets/brands/navidrome.png';
import brandWebdav from '../../src/assets/brands/webdav.png';
const ASSET_URLS: Record<string, string> = {
  'mark.png': markUrl,
  'brands/emby.png': brandEmby,
  'brands/jellyfin.png': brandJellyfin,
  'brands/navidrome.png': brandNavidrome,
  'brands/webdav.png': brandWebdav,
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
NM.AppVersionInfo = { versionName: '1.2.2', versionCode: 86, flavor: 'hd' };

// 原生能力占位（空对象：调用处已有 undefined 防御/try-catch；NativeEventEmitter 空对象在 RNW 宽松）
for (const m of ['NMScanner', 'NMDownloader', 'BlurModule', 'AppRestart', 'VersionModule']) {
  if (NM[m] === undefined) NM[m] = {};
}

// 桌面本机音频路由：虚拟扬声器 + HTML5 Audio 音量接线（audioroute.ts 有方法级守卫，此处给真实可用实现）
// v1.1.8:Dlna/Cast 桌面无原生模块——不进空对象循环(空对象 truthy 绕过 available 守卫、调不存在方法直接炸 Route 页);
// 填完整 no-op 实现(扫描立即结束空列表,UI 走「未发现设备」正常分支)
NM['NMDlna'] = {
  startDiscovery: () => {}, stopDiscovery: () => {},
  probeTcp: () => Promise.resolve('[]'),
  cast: () => Promise.reject(new Error('桌面版暂不支持 DLNA 投屏')),
  play: () => Promise.resolve(false), pause: () => Promise.resolve(false), stop: () => Promise.resolve(false),
  seek: () => Promise.resolve(false), getPosition: () => Promise.resolve('0'),
  getVolume: () => Promise.resolve('50'), setVolume: () => Promise.resolve(false),
};
NM['NMCast'] = {
  startDiscovery: () => {}, stopDiscovery: () => {},
  cast: () => Promise.reject(new Error('桌面版暂不支持 Chromecast 投屏')),
  play: () => Promise.resolve(false), pause: () => Promise.resolve(false), stop: () => Promise.resolve(false),
  seek: () => Promise.resolve(false), getPosition: () => Promise.resolve('{}'),
  getVolume: () => Promise.resolve(50), setVolume: () => Promise.resolve(false),
};
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
