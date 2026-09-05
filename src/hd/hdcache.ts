// hd-cache:HD 数据 SWR 式缓存(MMKV)——先展示陈旧数据秒开,后台刷新覆盖
// 卡顿/加载慢治理 lx91:电视端弱网+弱 CPU,榜单/推荐/播客首屏全部走缓存回填
import { createMMKV } from 'react-native-mmkv';

const kv = createMMKV({ id: 'nextmusic-hd-cache' });

type Entry<T> = { t: number; v: T };

/** 新鲜数据(TTL 内);null=无或过期 */
export function cacheGet<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = kv.getString(key);
    if (!raw) return null;
    const o = JSON.parse(raw) as Entry<T>;
    return Date.now() - o.t <= ttlMs ? o.v : null;
  } catch { return null; }
}

/** 陈旧兜底(不管多旧都给——配合后台刷新,总比空白快) */
export function cacheStale<T>(key: string): T | null {
  try {
    const raw = kv.getString(key);
    if (!raw) return null;
    return (JSON.parse(raw) as Entry<T>).v;
  } catch { return null; }
}

export function cacheSet<T>(key: string, v: T): void {
  try { kv.set(key, JSON.stringify({ t: Date.now(), v })); } catch { /* 序列化失败忽略 */ }
}
