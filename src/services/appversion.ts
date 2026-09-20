// 版本信息：优先读原生 BuildConfig（build.gradle 唯一真源），调试/异常时回退硬编码
import { NativeModules } from 'react-native';

const native = NativeModules.AppVersionInfo as { versionName?: string; versionCode?: number; flavor?: string } | undefined;

// web 构建(vite define 注入,与 desktop/package.json 同源);原生读 BuildConfig;兜底回退
const webVersion = ((globalThis as { process?: { env?: { APP_VERSION?: string; APP_FLAVOR?: string } } }).process)?.env?.APP_VERSION; // v3.28:process 经 globalThis
export const APP_VERSION = native?.versionName
  ? `${native.versionName} (${native.versionCode})`
  : webVersion || '1.2.15';

// UI 形态：hd = 车机/TV 横屏壳（独立包名），phone = 手机竖版
const webFlavor = ((globalThis as { process?: { env?: { APP_FLAVOR?: string } } }).process)?.env?.APP_FLAVOR;
export const APP_FLAVOR: 'phone' | 'hd' = native?.flavor === 'hd' || webFlavor === 'hd' ? 'hd' : 'phone';
export const IS_HD = APP_FLAVOR === 'hd';

// carlink(20260920 老板):手机包内嵌车机模式——CarLink/投屏/外接大屏时切 HD 大屏 UI(参照 hd 版)。
// 独立 hd 包恒 true;phone 包读设置(手动开关,v2 蓝牙车机自动检测)。闭包内即时读用 settings.get()。
import { settings } from './settings';
export function isCarUi(): boolean { return IS_HD || settings.get().carModeUi === true; }
