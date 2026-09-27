// cloudPresence —— 角标三态判定(LEO spec③ 同曲关联)
// 语义:仅本机 devices/text3 · 仅云端 cloud/brand · 双在 cloud-check/text2
// 判定=hash 相同 或 标题+歌手+时长±2s(spec E 条容差,比 localMatch 的 ±6s 严——角标宁可漏标不可错标)
// 云端索引=云曲库页/我的曲库页加载的 LibSong 列表;本机侧=下载记录(本地文件)+ 设备本地音乐
import { useEffect, useState } from 'react';
import { downloads, subscribeDownloads } from './downloads';
import { deviceSongs } from './devicelibrary';
import type { SongItem } from './server';
import type { LibSong } from './myLibrary';

export type Presence = 'local' | 'cloud' | 'both';

// ── 归一化(与 localMatch.ts 同族实现,容差独立) ──
function halfWidth(s: string): string {
  return (s || '').toLowerCase()
    .replace(/\u3000/g, ' ')
    .replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}
function norm(s: string): string {
  const u = halfWidth(s)
    .replace(/\([^()]*\)|（[^（）]*）|\[[^\[\]]*\]|【[^【】]*】|「[^「」]*」|『[^『』]*』/g, '');
  return u.replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}
function artists(s: string): string[] {
  return halfWidth(s)
    .split(/[,/;&+、]|\s+(?:feat\.?|ft\.?)\s+/)
    .map(x => norm(x))
    .filter(Boolean);
}
export function toSec(v?: string): number {
  if (!v) return 0;
  if (v.includes(':')) {
    const p = v.split(':');
    return (+p[0] || 0) * 60 + (+p[1] || 0);
  }
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

export interface TrackLike { name: string; singer: string; interval?: string; hash?: string }

/** 同曲判定:hash 相同(=custom 库 filename 身份)或 标题归一相等+歌手交集+时长±2s(双方有时长才校验) */
export function sameTrack(a: TrackLike, b: TrackLike & { filename?: string }): boolean {
  if (a.hash && b.filename && a.hash === b.filename) return true;
  const an = norm(a.name), bn = norm(b.name);
  if (!an || !bn || an !== bn) return false;
  const aa = artists(a.singer || ''), ba = artists(b.singer || '');
  if (aa.length && ba.length) {
    const hit = aa.some(x => ba.some(y => x.includes(y) || y.includes(x)));
    if (!hit) return false;
  }
  const da = toSec(a.interval), db = toSec(b.interval);
  if (da > 0 && db > 0 && Math.abs(da - db) > 2) return false;
  return true;
}

// ── 云端索引(会话级内存;云曲库页/我的曲库加载时喂入) ──
let cloudIndex: LibSong[] = [];
let cloudKnown = false; // 索引至少成功加载过一次(未加载时不标「仅本机」,防误报)
const listeners = new Set<() => void>();
function emit() { listeners.forEach(fn => fn()); }

export function setCloudSongs(list: LibSong[]) {
  cloudIndex = list;
  cloudKnown = true;
  memo.clear();
  emit();
}
export function isCloudKnown() { return cloudKnown; }

// ── 本机侧快照(downloads 有订阅;设备库无事件,TTL 5s 兜底) ──
type LocalSnap = { dl: { name: string; singer: string; interval?: string; hash?: string }[]; dev: { name: string; singer: string; interval?: string }[]; at: number };
let localSnap: LocalSnap = { dl: [], dev: [], at: 0 };
let snapSub = false;
function ensureSnap() {
  const now = Date.now();
  if (now - localSnap.at < 5000) return;
  try {
    localSnap = {
      dl: downloads.all().filter(r => !r.server && r.path && r.path !== 'server-cache').map(r => r.song),
      dev: deviceSongs().map(d => ({ name: d.name, singer: d.singer })),
      at: now,
    };
  } catch { localSnap = { ...localSnap, at: now }; }
  memo.clear();
}
export function invalidatePresenceLocal() { localSnap = { dl: [], dev: [], at: 0 }; ensureSnap(); }

// ── 判定(带 memo:列表页 200 行反复渲染防抖) ──
const memo = new Map<string, Presence | null>();
function keyOf(s: SongItem) { return `${s.source}|${s.songmid}|${s.hash || ''}|${s.interval || ''}|${(s as SongItem & { _lib?: string })._lib || ''}`; }

/** 公共库歌(_lib='public'):不占角标轴(定稿v3.0 细则2——来源=副行文字标注,由 SongRow 承接) */
function isPublicSong(s: SongItem): boolean {
  return (s as SongItem & { _lib?: string })._lib === 'public';
}

export function presenceOf(song: SongItem): Presence | null {
  if (isPublicSong(song)) return null;
  const k = keyOf(song);
  const hit = memo.get(k);
  if (hit !== undefined) return hit;
  ensureSnap();
  const local = song.source === 'device'
    || localSnap.dl.some(d => sameTrack(d, song))
    || localSnap.dev.some(d => sameTrack(d, song));
  const cloud = song.source === 'custom' || cloudIndex.some(c => sameTrack(song, c));
  let r: Presence | null = null;
  if (local && cloud) r = 'both';
  else if (cloud) r = 'cloud';
  else if (local && cloudKnown) r = 'local';
  if (memo.size > 3000) memo.clear();
  memo.set(k, r);
  return r;
}

// ── 定稿v3.0 细则2:角标数据契约——歌对象携带 locations:{local,cloud}(客户端 hash 缓存表即时计算,不服务端下发) ──
export interface SongLocations { local: boolean; cloud: boolean }
export function locationsOf(song: SongItem): SongLocations | null {
  if (isPublicSong(song)) return { local: false, cloud: false };
  const pv = presenceOf(song);
  if (!pv) return null;
  return { local: pv === 'local' || pv === 'both', cloud: pv === 'cloud' || pv === 'both' };
}

/** 订阅云端索引变化(SongRow 角标随索引加载刷新) */
export function subscribePresence(fn: () => void) {
  listeners.add(fn);
  if (!snapSub) {
    snapSub = true;
    try { subscribeDownloads(() => { invalidatePresenceLocal(); fn(); }); } catch { /* ignore */ }
  }
  return () => { listeners.delete(fn); };
}
export function usePresenceVersion() {
  const [, force] = useState(0);
  useEffect(() => subscribePresence(() => force(n => n + 1)), []);
}
