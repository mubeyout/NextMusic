// 版本信息：优先读原生 BuildConfig（build.gradle 唯一真源），调试/异常时回退硬编码
import { NativeModules } from 'react-native';

const native = NativeModules.AppVersionInfo as { versionName?: string; versionCode?: number } | undefined;

export const APP_VERSION = native?.versionName
  ? `${native.versionName} (${native.versionCode})`
  : '1.0.2';
