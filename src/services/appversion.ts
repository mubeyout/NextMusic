// 版本信息：优先读原生 BuildConfig（build.gradle 唯一真源），调试/异常时回退硬编码
import { NativeModules } from 'react-native';

const native = NativeModules.AppVersionInfo as { versionName?: string; versionCode?: number; flavor?: string } | undefined;

export const APP_VERSION = native?.versionName
  ? `${native.versionName} (${native.versionCode})`
  : '1.0.3';

// UI 形态：hd = 车机/TV 横屏壳（独立包名），phone = 手机竖版
export const APP_FLAVOR: 'phone' | 'hd' = native?.flavor === 'hd' ? 'hd' : 'phone';
export const IS_HD = APP_FLAVOR === 'hd';
