// 桌面 polyfills：必须在一切主仓模块 import 之前执行（appversion 等在模块加载期读原生）
import { NativeModules } from 'react-native';
// RN 源码里的 require('./x.png') 静态资产引用（Metro 专有；vite/ESM 浏览器环境无 require）——
// 映射到 vite 构建产物 URL。未知 id 抛错便于发现新增触点。
import markUrl from '../../src/assets/brand/mark.png';
const ASSET_URLS: Record<string, string> = { 'mark.png': markUrl };
(globalThis as { require?: unknown }).require = (id: string): unknown => {
  if (typeof id === 'string') {
    for (const [k, url] of Object.entries(ASSET_URLS)) {
      if (id.endsWith(k)) return { uri: url }; // RNW Image source {uri};Android Metro 返回 asset number,不受影响
    }
  }
  throw new Error('[desktop] require() 不支持的模块: ' + String(id));
};

// 形态 = HD（车机/TV 横版 UI，桌面同构）；后续可细分 desktop 差异
const NM = NativeModules as Record<string, unknown>;
NM.AppVersionInfo = { versionName: '1.1.3', versionCode: 77, flavor: 'hd' };

// 原生能力占位（空对象：调用处已有 undefined 防御/try-catch；NativeEventEmitter 空对象在 RNW 宽松）
for (const m of ['NMAudioRoute', 'NMDlna', 'NMCast', 'NMScanner', 'NMDownloader', 'BlurModule', 'AppRestart', 'VersionModule']) {
  if (NM[m] === undefined) NM[m] = {};
}
