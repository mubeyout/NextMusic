// lx112:系统输出频谱接入(RECORD_AUDIO 运行时请求;拒绝则静默降级=伪律动)
import { NativeModules, NativeEventEmitter, PermissionsAndroid, Platform } from 'react-native';

const NMV = NativeModules.NMVisualizer as { start(): Promise<boolean>; stop(): () => void } | undefined;

export function startSpectrum(cb: (bins: number[]) => void): () => void {
  if (Platform.OS !== 'android' || !NMV) return () => {};
  let sub: { remove: () => void } | null = null;
  let stopped = false;
  (async () => {
    try {
      const perm = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (stopped || perm !== 'granted') return;
      await NMV.start();
      if (stopped) { NMV.stop(); return; }
      sub = (new NativeEventEmitter(NativeModules.NMVisualizer as never) as unknown as { addListener: (n: string, f: (e: { bins: number[] }) => void) => { remove: () => void } })
        .addListener('NMVisualizer', e => cb(e.bins || []));
    } catch { /* 无权限/不支持:上层继续伪律动 */ }
  })();
  return () => { stopped = true; sub?.remove(); try { NMV?.stop(); } catch { /* ignore */ } };
}
