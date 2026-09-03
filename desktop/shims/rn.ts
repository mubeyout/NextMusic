// react-native web 包装:RNW 全量 re-export + 补缺失 API(桌面无 Android 权限/无原生唤醒)
export * from '../node_modules/react-native-web/dist/index.js';

export const PermissionsAndroid = {
  request: async () => 'granted',
  check: async () => true,
  PERMISSIONS: { WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE' },
  RESULTS: { GRANTED: 'granted' },
};
// RNW 无 ToastAndroid/AlertIOS 等移动端件
export const ToastAndroid = { show: () => {}, SHORT: 0, LONG: 1 };
// TurboModuleRegistry(web 无原生模块):getEnforcing 返回空 Proxy,调用时报可读错
export const TurboModuleRegistry = {
  get: () => undefined,
  getEnforcing: (name: string) => new Proxy({}, { get: () => { throw new Error(`TurboModule '${name}' 桌面版不可用`); } }),
};
