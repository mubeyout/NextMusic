// publicLibrary.ts —— 公共曲库数据层(LEO v2.2 规格④ · 契约§3 用户端端点族)
// 端点:/api/public-library/{summary,albums,album,artists,artist,songs,prefs}
// 铁律:未授权(未登录/未授权/库未启用/路径不存在)一律同形 404 → 三端入口完全不渲染(无灰置);
//      任何内容端点 404 → onPub404():入口移除+清本地缓存态(下次授权恢复)
// 多源(v2.2 修正③):契约未带 sourceName → 查 summary.sources 映射,都没有留位不显(pubSourceName)
import { useEffect, useState } from 'react';
import { createMMKV } from 'react-native-mmkv';
import { req, store as httpStore } from './server';
import type { SongItem } from './server';
import { toSongItem, type LibSong, type LibAlbum, type LibArtist } from './myLibrary';

export interface PubScanStatus { running: boolean; startedAt: number; lastError: string | null; syncedAt: number; songs: number; albums: number; artists: number; totalBytes: number }
// [1010 崩溃修复] sources value 线上实为对象({name,...})而非 string(类型与运行时不符→chips 直接渲染对象炸 React#31);联合类型+pubSrcName 归一
export type PubSourceMeta = string | { name?: string; label?: string };
export interface PubSummary { name: string; scan: PubScanStatus; sources?: Record<string, PubSourceMeta> | null }
export interface PubEntryState { authorized: boolean; showEntry: boolean; summary: PubSummary | null }

// ── 入口态(轻订阅 store:三端入口+账号设置行共用) ──
let st: PubEntryState = { authorized: false, showEntry: true, summary: null };
const subs = new Set<() => void>();
function setSt(patch: Partial<PubEntryState>) {
  st = { ...st, ...patch };
  subs.forEach(f => f());
}
export function usePubEntry(): PubEntryState {
  const [v, setV] = useState(st);
  useEffect(() => {
    const f = () => setV(st);
    subs.add(f);
    f();
    return () => { subs.delete(f); };
  }, []);
  return v;
}

// ── 本地缓存态(授权用户入口秒出;404 即清——「清本地缓存态」铁律) ──
const pubKv = createMMKV({ id: 'nextmusic-publib' });
function cacheRead(): { summary: PubSummary | null; showEntry: boolean } | null {
  try { const v = pubKv.getString('state'); return v ? JSON.parse(v) as { summary: PubSummary | null; showEntry: boolean } : null; } catch { return null; }
}
function cacheWrite() { try { pubKv.set('state', JSON.stringify({ summary: st.summary, showEntry: st.showEntry })); } catch { /* 配额满忽略 */ } }
function cacheClear() { try { pubKv.remove('state'); } catch { /* ignore */ } }
// 启动缓存先行(被撤授权 → 首次校验 404 即时移除,铁律闭环)
(() => {
  const c = cacheRead();
  if (c && c.summary) st = { authorized: true, showEntry: c.showEntry !== false, summary: c.summary };
})();

// ── 请求底座(信封解包,同 myLibrary.lx185)+404 铁律 ──
async function unwrap<T>(p: Promise<unknown>): Promise<T> {
  const r = await p as { success?: boolean; data?: T; message?: string };
  if (r && typeof r === 'object' && 'data' in r) {
    if (r.success === false) throw new Error(r.message || '服务器返回失败');
    return r.data as T;
  }
  return r as T;
}
function is404(e: unknown): boolean { return typeof e === 'object' && e !== null && (e as { status?: number }).status === 404; }
/** 404 铁律联动:入口移除+清本地缓存态(下次授权恢复) */
export function onPub404(): void {
  setSt({ authorized: false, showEntry: true, summary: null });
  cacheClear();
}
async function g<T>(p: Promise<unknown>): Promise<T> {
  try { return await unwrap<T>(p); }
  catch (e) {
    if (is404(e)) { onPub404(); throw new Error('公共曲库不可用'); }
    throw e;
  }
}

// ── 授权态校验(summary 探测+prefs 个人开关;屏挂载/聚焦常调,30s 轻节流) ──
let checking = false, lastCheck = 0;
export function pubCheck(force = false): void {
  // [KAI 20261001] 匿名分支幂等 bail：未登录态已就位时不再重放 setSt——
  // setSt 每次新对象→订阅者(HDMain usePubEntry)重淄→内联 withPhoneScale 新身份→整屏重挂→
  // 重挂即重跑 focus effect→又 pubCheck：自激 94Hz 重淄风暴=匿名态媒体库整屏触摸死根因。
  // 已处于未登录态时状态无变化，跳过。（登录→退出的一次性迁移仍会触发）
  if (!httpStore.token) {
    if (!st.authorized && st.summary == null) return;
    setSt({ authorized: false, summary: null });
    return;
  } // 未登录:同形不可见(404 语义)
  if (checking || (!force && Date.now() - lastCheck < 30_000)) return;
  checking = true;
  (async () => {
    try {
      const s = await unwrap<PubSummary>(req('/api/public-library/summary'));
      lastCheck = Date.now();
      setSt({ authorized: true, summary: s });
      cacheWrite();
      try {
        const p = await unwrap<{ showEntry: boolean }>(req('/api/public-library/prefs'));
        setSt({ showEntry: p.showEntry !== false }); // 3.8 默认 true
        cacheWrite();
      } catch (e) { if (is404(e)) { onPub404(); return; } /* prefs 网络错:保持现值 */ }
    } catch (e) {
      lastCheck = Date.now();
      if (is404(e)) onPub404(); // 撤授权/停用 → 入口移除+清缓存
      /* 网络错:保持现值(离线容忍,缓存入口仍可见) */
    } finally { checking = false; }
  })();
}

/** 个人显示开关(乐观 UI;失败回滚并抛错,调用方 toast) */
export function pubSetShowEntry(v: boolean): Promise<void> {
  setSt({ showEntry: v });
  cacheWrite();
  return g<never>(req('/api/public-library/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ showEntry: v }) }))
    .then(() => undefined)
    .catch(e => { if (st.authorized) { setSt({ showEntry: !v }); cacheWrite(); } throw e; }); // 404 已走 onPub404(态已清),不回滚
}

// ── 内容端点族(契约§3;分页 size 由调用方给:手机 50/HD 100) ──
export const pubLib = {
  albums(type: 'newest' | 'random' = 'newest', size = 50, offset = 0): Promise<{ albums: LibAlbum[]; total: number }> {
    return g(req(`/api/public-library/albums?type=${type}&size=${size}&offset=${offset}`));
  },
  album(id: string): Promise<{ album: LibAlbum; songs: LibSong[] }> {
    return g(req(`/api/public-library/album?id=${encodeURIComponent(id)}`));
  },
  artists(offset = 0, limit = 0): Promise<{ artists: LibArtist[]; total: number }> {
    return g(req(`/api/public-library/artists?offset=${offset}&limit=${limit}`));
  },
  artist(id: string): Promise<{ artist: LibArtist; albums: LibAlbum[]; songs: LibSong[] }> {
    return g(req(`/api/public-library/artist?id=${encodeURIComponent(id)}`));
  },
  songs(type: 'recent' | 'random' = 'recent', size = 50): Promise<{ songs: LibSong[] }> {
    return g(req(`/api/public-library/songs?type=${type}&size=${size}`));
  },
};

/** 公共曲库歌 → SongItem(_lib='public' 随歌携带:队列/跨页播放 URL 域不丢) */
export function pubToSongItem(l: LibSong): SongItem { return toSongItem(l, 'public'); }

/** 源名归一(1010):string 直用;对象取 name/label;空回退 key——防对象进 Text 炸 React#31 */
export function pubSrcName(v: PubSourceMeta | undefined | null, k = ''): string {
  if (typeof v === 'string' && v) return v;
  if (v && typeof v === 'object') { const n = v.name ?? v.label; if (n) return n; }
  return k;
}

/** 副行源名(v2.2 多源:歌.sourceName 优先 → summary.sources 映射 → 都没有留位不显) */
export function pubSourceName(song: LibSong, summary: PubSummary | null): string | undefined {
  const ext = song as LibSong & { sourceName?: string; source?: string };
  if (ext.sourceName) return ext.sourceName;
  if (summary?.sources && ext.source && summary.sources[ext.source]) return pubSrcName(summary.sources[ext.source], ext.source) || undefined;
  return undefined;
}
