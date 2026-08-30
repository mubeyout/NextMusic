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
    if (meta.songId) songInfo.songmid = String(meta.songId);
    else if (songInfo.id) {
      const pre = `${songInfo.source}_`;
      if (typeof songInfo.id === 'string' && songInfo.id.startsWith(pre)) songInfo.songmid = songInfo.id.slice(pre.length);
      else songInfo.songmid = String(songInfo.id); // 部分源（如 kg 排行榜）id 是数字，统一转 string 防 .split/.startsWith 崩
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

// --- lx37: 歌单多源粘性解析 ---
// 单押 wy 时，wy 侧任何抖动（网易 406 限流 / 代理路径拦截 / CDN 分流）都会让
// 首页三区块（为你打造 / 热门歌单 / 热门主题）同时空白——三处共用同一数据链路。
// 探测链 wy→tx→mg→kg（kw 的 getList 实测恒空，不进链），第一个返回非空列表的源粘住 10 分钟；
// 标签名跨源翻译（wy 用中文名当 tagId，mg/kg/tx 用各自数字 id），翻译不了降级该源推荐位（tagId=''）。
const SL_CHAIN = ['wy', 'mg', 'kg']; // tx getListDetail 上游 bug（cdlist undefined）弃用；kw getList 恒空弃用
const SL_STICKY_MS = 10 * 60_000;
let slSrc: string | null = null;
let slSrcAt = 0;
let slProbe: Promise<string> | null = null;

async function resolveSongListSource(force = false): Promise<string> {
  if (!force && slSrc && Date.now() - slSrcAt < SL_STICKY_MS) return slSrc;
  if (!force && slProbe) return slProbe;
  const probe = (async () => {
    for (const s of SL_CHAIN) {
      try {
        const r = await engine.sdk<any>([s, 'songList', 'getList'], ['5', '', 1], 12000);
        if (Array.isArray(r?.list) && r.list.length) {
          CACHE.set(`sll:${s}:5::1`, { at: Date.now(), data: r }); // 探测结果直接种进缓存，首页同 key 零额外请求
          if (s !== slSrc) console.log(`[lxapi] songList source → ${s} (${r.list.length})`);
          slSrc = s; slSrcAt = Date.now();
          return s;
        }
        console.log(`[lxapi] songList source ${s}: empty`);
      } catch (e) { console.log(`[lxapi] songList source ${s}: ${(e as Error).message}`); }
    }
    throw new Error('歌单源均不可用');
  })();
  if (force) return probe; // force 重探不共享（粘性源已判死）
  slProbe = probe.finally(() => { slProbe = null; });
  return slProbe;
}

// wy 之外 tagId 体系不同：在目标源标签表里找同名/包含匹配；找不到返回 ''（推荐位，保证有内容）
async function translateTag(tagId: string, source: string): Promise<string> {
  if (!tagId || source === 'wy') return tagId;
  try {
    const t = await lxapi.songListTags(source);
    const pool: { id: unknown; name: unknown }[] = [
      ...((t.hotTag || []) as any[]),
      ...(t.tags || []).flatMap((g: any) => g.list || []),
    ];
    const norm = (x: unknown) => String(x ?? '').replace(/\s+/g, '');
    const hit = pool.find(x => norm(x.name) === norm(tagId))
      || pool.find(x => { const n = norm(x.name); return n && (n.includes(norm(tagId)) || norm(tagId).includes(n)); });
    return hit ? String(hit.id) : '';
  } catch { return ''; }
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

  async songListTags(source = 'wy'): Promise<{ tags: { name: string; list: { id: string; name: string }[] }[]; hotTag?: { id: string; name: string }[]; sortList?: unknown }> {
    return cached(`slt:${source}`, 30 * 60_000, async () => {
      try {
        const r = await engine.sdk<any>([source, 'songList', 'getTags'], []);
        // wy/tx 返回 {tags:[{name,list}]}；mg/kg 返回 {hotTag:[{id,name}]}——两种形态都保留
        let sortList: unknown;
        try { sortList = await engine.sdk<any>([source, 'songList', 'sortList'], []); } catch { /* tx/mg/kg 无此方法，非致命 */ }
        return { tags: Array.isArray(r?.tags) ? r.tags : [], hotTag: Array.isArray(r?.hotTag) ? r.hotTag : [], sortList };
      } catch { return { tags: [], hotTag: [] }; }
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

  /** lx37: 自动源歌单列表（首页/探索专用）。源挂了 throw，UI 层可 catch 后 force 重探换源。 */
  async songListAuto(tagId: string, sortId = '5', page = 1, limit = 20, force = false): Promise<{ list: SongListMeta[]; source: string }> {
    const src = await resolveSongListSource(force);
    const t = await translateTag(tagId, src);
    const r = await this.songListList(t, sortId, page, limit, src);
    const list = (r.list || []).map((pl: any) => { if (!pl.source) pl.source = src; return pl as SongListMeta; });
    if (!list.length) throw new Error(`歌单空(${src})`); // 空≠成功：让 UI 走重试/换源，不给假成功
    return { list, source: src };
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
      // SDK 里 getLyric 是源模块根方法（kw.getLyric / kg.getLyric），不是 lyric 子模块
      // （旧代码 [source,'lyric','getLyric'] 会报 "reading 'lyric'"，一直靠服务器 fallback 顶着）
      return await engine.sdk<any>([songInfo.source, 'getLyric'], [info]);
    } catch { return {}; }
  },
  /** 按歌名+歌手跨平台匹配取词：媒体库源（Emby/Subsonic 等）歌曲 id 无平台意义，用文本匹配同曲目标
   *  匹配策略：wy → kg 两轮（kw 对冷门歌模糊匹配乱回），歌名必须互相包含 + 歌手首名包含；
   *  匹配不到返回空（宁缺毋滥，不显示错误歌词） */
  async lyricByName(name: string, singer: string): Promise<{ lyric?: string; tlyric?: string; rlyric?: string; lxlyric?: string; lrc?: string }> {
    if (!name) return {};
    const nl = name.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim(); // 剥 Live/伴奏 等括号后缀
    const sl = (singer || '').toLowerCase().split(/[,，、&]/)[0].trim();
    for (const src of ['wy', 'kg']) {
      try {
        const list = await this.search(name, src, 1, 20);
        const best = list.find(x => {
          const xn = (x.name || '').toLowerCase();
          const xs = (x.singer || '').toLowerCase();
          return xn.includes(nl) && (!sl || xs.includes(sl));
        });
        if (best) {
          const r = await this.lyric(best);
          if (r.lyric || r.lxlyric || r.lrc) return r;
        }
      } catch { /* 下一个源 */ }
    }
    return {};
  },
};

function songmidOf(s: SongItem): string {
  const pre = `${s.source}_`;
  return typeof s.songmid === 'string' && s.songmid.startsWith(pre) ? s.songmid.slice(pre.length) : String(s.songmid ?? '');
}
