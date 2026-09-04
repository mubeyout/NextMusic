// 桌面 polyfills：必须在一切主仓模块 import 之前执行（appversion 等在模块加载期读原生）
import { NativeModules } from 'react-native';

// 形态 = HD（车机/TV 横版 UI，桌面同构）；后续可细分 desktop 差异
const NM = NativeModules as Record<string, unknown>;
NM.AppVersionInfo = { versionName: '1.1.2', versionCode: 76, flavor: 'hd' };

// 原生能力占位（空对象：调用处已有 undefined 防御/try-catch；NativeEventEmitter 空对象在 RNW 宽松）
for (const m of ['NMAudioRoute', 'NMDlna', 'NMCast', 'NMScanner', 'NMDownloader', 'BlurModule', 'AppRestart', 'VersionModule']) {
  if (NM[m] === undefined) NM[m] = {};
}
