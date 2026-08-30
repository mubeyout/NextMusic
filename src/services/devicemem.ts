// 已知投屏设备记忆（lx42）
// 组播发现正常时记住设备；AP/路由器组播抽风（LAN→WiFi 丢包等）导致扫描空结果时，
// 由 RouteScreen 用 TCP 探活兜底恢复显示。设备换 IP 后探活失败自然淘汰。
import { createMMKV } from 'react-native-mmkv';

const kv = createMMKV({ id: 'nextmusic-devices' });
const KEY = 'known';
const MAX = 10;
const TTL = 7 * 24 * 3600_000; // 7 天未见即淘汰

export type KnownDevice = {
  kind: 'dlna' | 'cast';
  uuid: string;
  name: string;
  host: string;
  port: number;
  controlUrl?: string; // dlna SOAP 控制端点（绝对 URL）
  rcUrl?: string;
  lastSeen: number;
};

export function loadKnown(): KnownDevice[] {
  try {
    const now = Date.now();
    const list = (JSON.parse(kv.getString(KEY) || '[]') as KnownDevice[])
      .filter(d => d && d.host && d.port && now - (d.lastSeen || 0) < TTL);
    return list.slice(0, MAX);
  } catch { return []; }
}

/** 合并记忆（按 kind+host+port 去重，刷新 lastSeen） */
export function rememberKnown(devs: KnownDevice[]): void {
  if (!devs.length) return;
  const cur = loadKnown().filter(d => !devs.some(x => x.kind === d.kind && x.host === d.host && x.port === d.port));
  const next = [...devs, ...cur].slice(0, MAX);
  try { kv.set(KEY, JSON.stringify(next)); } catch { /* 存储满等异常忽略 */ }
}

/** 从绝对 URL 提取 host/port（纯字符串正则——坑58：RN 的 URL 构造器不可靠） */
export function hostPortOf(url: string | undefined): { host: string; port: number } | null {
  if (!url) return null;
  let m = /^https?:\/\/\[?([^\]/:]+)\]?:(\d{2,5})/.exec(url);
  if (m) return { host: m[1], port: parseInt(m[2], 10) };
  m = /^https?:\/\/\[?([^\]/:]+)/.exec(url);
  if (m) return { host: m[1], port: url.startsWith('https') ? 443 : 80 };
  return null;
}
