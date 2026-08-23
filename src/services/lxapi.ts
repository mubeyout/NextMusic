// Direct-to-platform browse APIs via LxEngine sandbox (no server involved).
// Mirrors lxserver route semantics (/api/music/search|hotSearch|songList|leaderboard|comment|lyric).
import { engine } from '../lx-engine/engine';
import type { SongItem, SongListMeta } from './server';

// --- normalizeSongInfo (same as lxserver server.js) ---
function normalize(songInfo: any): any {
  if (!songInfo) return songInfo;
  const meta = songInfo.meta || {};
  if (!songInfo.types) songInfo.types = meta.qualitys || meta.types;
  if (!songInfo._types) songInfo._types = meta._qualitys || meta._types;
  if (!songInfo.albumName && meta.albumName) songInfo.albumName = meta.albumName;
  if (!songInfo.albumId && meta.albumId) songInfo.albumId = meta.albumId;
  if (!songInfo.img && meta.picUrl) songInfo.img = meta.picUrl;
  if (!songInfo.name && meta.name) songInfo.name = meta.name;
  if (!songInfo.singer && meta.singer) songInfo.singer = meta.singer;
  if (!songInfo.source && meta.source) songInfo.source = meta.source;
  if (!songInfo.interval && meta.interval) songInfo.interval = meta.interval;
  if (!songInfo.songmid) {
    if (meta.songId) songInfo.songmid = meta.songId;
    else if (songInfo.id) {
      const pre = `${songInfo.source}_`;
      if (typeof songInfo.id === 'string' && songInfo.id.startsWith(pre)) songInfo.songmid = songInfo.id.slice(pre.length);
      else songInfo.songmid = songInfo.id;
    }
  }
  if (!songInfo.hash && meta.hash) songInfo.hash = meta.hash;
  if (!songInfo.lrcUrl && meta.lrcUrl) songInfo.lrcUrl = meta.lrcUrl;
  if (!songInfo.mrcUrl && meta.mrcUrl) songInfo.mrcUrl = meta.mrcUrl;
  if (!songInfo.trcUrl && meta.trcUrl) songInfo.trcUrl = meta.trcUrl;
  if (!songInfo.copyrightId && meta.copyrightId) songInfo.copyrightId = meta.copyrightId;
  return songInfo;
}

function songIdOnly(id: string, source: string): string {
  const pre = `${source}_`;
  return id.startsWith(pre) ? id.slice(pre.length) : id;
}

// --- 浏览数据缓存（stale-while-revalidate）---
// 命中新鲜数据直接返回；过期数据先回旧值、后台静默刷新；同 key 并发去重。
// 目的：切 Tab/回退不再白屏等数据；同时削减对平台 API 的请求量（防 406）。
interface CacheEntry { at: number; data: unknown }
const CACHE = new Map<string, CacheEntry>();
const INFLIGHT = new Map<string, Promise<unknown>>();

function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.data as T);
  if (hit) {
    // stale：立即回旧值，后台刷新（不阻塞 UI）
    if (!INFLIGHT.has(key)) {
      INFLIGHT.set(key, fetcher()
        .then(d => { CACHE.set(key, { at: Date.now(), data: d }); return d; })
        .finally(() => { INFLIGHT.delete(key); }));
    }
    return Promise.resolve(hit.data as T);
  }
  // 无缓存：首次必须等（并发同 key 共享同一请求）
  let p = INFLIGHT.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fetcher()
      .then(d => { CACHE.set(key, { at: Date.now(), data: d }); return d; })
      .finally(() => { INFLIGHT.delete(key); }) as Promise<T>;
    INFLIGHT.set(key, p);
  }
  return p;
}

export const lxapi = {
  async search(name: string, source = 'kw', page = 1, limit = 20): Promise<SongItem[]> {
    return cached(`sr:${source}:${name}:${page}:${limit}`, 10 * 60_000, async () => {
      try {
        const r = await engine.sdk<{ list?: any[] }>([source, 'musicSearch', 'search'], [name, page, limit]);
        return (r?.list || []).map(normalize);
      } catch (e) {
        console.log('[lxapi] search fail', (e as Error).message);
        return [];
      }
    });
  },

  async tipSearch(name: string, source = 'kw'): Promise<string[]> {
    try {
      const r = await engine.sdk<any>([source, 'tipSearch', 'search'], [name]);
      return Array.isArray(r) ? r : [];
    } catch { return []; }
  },

  async hotSearch(source = 'mg'): Promise<string[]> {
    return cached(`hs:${source}`, 10 * 60_000, async () => {
      try {
        const r = await engine.sdk<any>([source, 'hotSearch', 'getList'], []);
        if (Array.isArray(r)) return r.slice(0, 30);
        if (r && Array.isArray((r as any).source?.data)) return (r as any).source.data.slice(0, 30);
        if (r && Array.isArray((r as any).source)) return ((r as any).source as any[]).map((x: any) => x.name || '').filter(Boolean).slice(0, 30);
        return [];
      } catch { return []; }
    });
  },

  async songListTags(source = 'wy'): Promise<{ tags: { name: string; list: { id: string; name: string }[] }[]; sortList?: unknown }> {
    return cached(`slt:${source}`, 30 * 60_000, async () => {
      try {
        const r = await engine.sdk<any>([source, 'songList', 'getTags'], []);
        const sortList = await engine.sdk<any>([source, 'songList', 'sortList'], []);
        return { tags: Array.isArray(r?.tags) ? r.tags : [], sortList };
      } catch { return { tags: [] }; }
    });
  },

  async songListList(tagId: string, sortId = '5', page = 1, limit = 20, source = 'wy'): Promise<{ list?: SongListMeta[]; total?: number; limit?: number; allPage?: number; info?: unknown }> {
    return cached(`sll:${source}:${sortId}:${tagId}:${page}`, 5 * 60_000, async () => {
      try {
        void limit;
        return await engine.sdk<any>([source, 'songList', 'getList'], [sortId, tagId, page]);
      } catch (e) { console.log('[lxapi] songListList fail', (e as Error).message); return {}; }
    });
  },

  async songListDetail(id: string, page = 1, source = 'wy'): Promise<{ list?: SongItem[]; page?: number; limit?: number; total?: number; source?: string; info?: SongListMeta }> {
    return cached(`sld:${source}:${id}:${page}`, 10 * 60_000, async () => {
      try {
        const r = await engine.sdk<any>([source, 'songList', 'getListDetail'], [id, page]);
        if (r && Array.isArray(r.list)) r.list = r.list.map(normalize);
        return r || {};
      } catch { return {}; }
    });
  },

  async leaderboardBoards(source = 'kg'): Promise<{ id: string; name: string; bangid: string; image?: string }[]> {
    return cached(`lbb:${source}`, 30 * 60_000, async () => {
      try {
        const r = await engine.sdk<any>([source, 'leaderboard', 'getBoards'], []);
        return Array.isArray(r?.list) ? r.list : [];
      } catch (e) { console.log('[lxapi] leaderboardBoards fail', (e as Error).message); return []; }
    });
  },

  async leaderboardList(bangid: string, source = 'kg', page = 1): Promise<SongItem[]> {
    return cached(`lbl:${source}:${bangid}:${page}`, 10 * 60_000, async () => {
      try {
        const r = await engine.sdk<any>([source, 'leaderboard', 'getList'], [bangid, page]);
        return Array.isArray(r?.list) ? r.list.map(normalize) : [];
      } catch { return []; }
    });
  },

  async comment(songInfo: SongItem, type: 'hot' | 'new' = 'hot', page = 1, limit = 20): Promise<{ source?: string; comments?: any[]; total?: number; allPage?: number; limit?: number }> {
    try {
      const method = type === 'hot' ? 'getHotComment' : 'getComment';
      return await engine.sdk<any>([songInfo.source, 'comment', method], [normalize({ ...songInfo }), page, limit]);
    } catch { return {}; }
  },

  async lyric(songInfo: SongItem): Promise<{ lyric?: string; tlyric?: string; rlyric?: string; lxlyric?: string; lrc?: string }> {
    try {
      const si = songInfo as SongItem & { copyrightId?: string; lrcUrl?: string; mrcUrl?: string; trcUrl?: string };
      const info = {
        songmid: songInfo.songmid || songmidOf(songInfo),
        name: songInfo.name || '',
        singer: songInfo.singer || '',
        hash: songInfo.hash || '',
        interval: songInfo.interval || '',
        copyrightId: si.copyrightId || '',
        albumId: songInfo.albumId || '',
        lrcUrl: si.lrcUrl || '',
        mrcUrl: si.mrcUrl || '',
        trcUrl: si.trcUrl || '',
      };
      return await engine.sdk<any>([songInfo.source, 'lyric', 'getLyric'], [info]);
    } catch { return {}; }
  },
};

function songmidOf(s: SongItem): string {
  const pre = `${s.source}_`;
  return typeof s.songmid === 'string' && s.songmid.startsWith(pre) ? s.songmid.slice(pre.length) : String(s.songmid ?? '');
}
