// LX Server API client — verified against live server 10.0.0.1:9527
export interface SongItem {
  name: string;
  singer: string;
  source: string;
  songmid: string;
  albumId: string;
  interval: string;
  albumName?: string;
  lrc?: string | null;
  img?: string;
  hash?: string;
  otherSource?: unknown;
  types?: { type: string; size: string }[];
  _types?: Record<string, { size: string }>;
  typeUrl?: Record<string, string>;
  container?: string; // 媒体库源：音频容器（ape/wma 等无损需服务端转码，ExoPlayer 解不了）
}

export interface SongListMeta {
  play_count?: string;
  id: string;
  author?: string;
  name: string;
  time?: string;
  img?: string;
  total?: number;
  desc?: string;
  source?: string;
}

export interface ServerConfig {
  'player.enableAuth'?: boolean;
  'user.enablePublicRestriction'?: boolean;
  [k: string]: unknown;
}

export function normalizeBase(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(u)) u = 'http://' + u;
  return u;
}

export async function req(path: string, init?: RequestInit & { base?: string; timeout?: number }) {
  // 服务器对并发请求返回 500（实测 6 并发 5 个 500），全局串行化 + 失败重试一次
  return enqueue(() => reqOnce(path, init, 0));
}

async function reqOnce(path: string, init: RequestInit & { base?: string; timeout?: number } | undefined, attempt: number): Promise<unknown> {
  const base = normalizeBase(init?.base || store.base);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeout ?? 12000);
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (store.token && !headers['x-user-token']) headers['x-user-token'] = store.token;
  try {
    const r = await fetch(base + path, { ...init, headers, signal: ctrl.signal });
    const text = await r.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* keep text */ }
    if (!r.ok) {
      // 500 多为服务端并发/上游抖动，退避后重试一次
      if (r.status >= 500 && attempt < 1) {
        await new Promise<void>(res => setTimeout(() => res(), 600));
        return reqOnce(path, init, attempt + 1);
      }
      // lx163g:401=token 失效(服务器重建/换密)——用存档凭据自动重登一次并重放(attempt 1→2,登录请求自身 attempt=5 不进)
      if (r.status === 401 && attempt < 2 && !path.includes('/api/user/login')) {
        if (await tryRelogin()) return reqOnce(path, init, 2);
      }
      throw Object.assign(new Error('HTTP ' + r.status), { status: r.status, data });
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

// 全局串行队列：同一时刻只发 1 个请求
let queueTail: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queueTail.then(job, job as (v: unknown) => Promise<T>);
  queueTail = run.catch(() => undefined);
  return run;
}

// Tiny module-level store so req() can run before React mounts
export const store = {
  base: '',
  token: '',
};

// lx163g:登录凭据持久化(可选)——服务器重建/换 token 后 401 自动重登,歌单不再集体蒸发
import { createMMKV } from 'react-native-mmkv';
const credKv = createMMKV({ id: 'nextmusic-creds' });
export function saveCreds(username: string, password: string) {
  if (username && password) credKv.set('c', JSON.stringify({ username, password }));
}
export function clearCreds() { credKv.set('c', ''); }
function readCreds(): { username: string; password: string } | null {
  try { return JSON.parse(credKv.getString('c') || 'null'); } catch { return null; }
}
let reloginInFlight: Promise<boolean> | null = null;
async function tryRelogin(): Promise<boolean> {
  const c = readCreds();
  if (!c || !store.base) return false;
  if (reloginInFlight) return reloginInFlight;
  reloginInFlight = (async () => {
    try {
      const r = (await reqOnce('/api/user/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c), timeout: 10000,
      }, 5)) as { token?: string }; // attempt=5:绕过 500 重试分支直达
      if (r?.token) { store.token = r.token; return true; }
      return false;
    } catch { return false; }
    finally { setTimeout(() => { reloginInFlight = null; }, 1000); }
  })();
  return reloginInFlight;
}

export const api = {
  async probe(base: string): Promise<ServerConfig> {
    return req('/api/music/config', { base, timeout: 6000 }) as Promise<ServerConfig>;
  },
  async search(kw: string, source = 'kw'): Promise<SongItem[]> {
    const q = `?name=${encodeURIComponent(kw)}&source=${encodeURIComponent(source)}`;
    return (await req('/api/music/search' + q)) as SongItem[];
  },
  async hotSearch(): Promise<string[]> {
    try {
      const d = await req('/api/music/hotSearch');
      if (Array.isArray(d)) return d.slice(0, 30) as string[];
      if (d && Array.isArray((d as { source?: { data?: string[] } }).source?.data)) {
        return (d as { source: { data: string[] } }).source.data.slice(0, 30);
      }
      if (d && Array.isArray((d as { source?: unknown[] }).source)) {
        return ((d as { source: unknown[] }).source as { name?: string }[]).map(x => x.name || '').filter(Boolean).slice(0, 30);
      }
      return [];
    } catch { return []; }
  },
  async musicUrl(songInfo: SongItem, type = '128k'): Promise<{ url: string; type: string; sourceName?: string }> {
    return req('/api/music/url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songInfo, type, source: songInfo.source }),
      timeout: 20000,
    }) as Promise<{ url: string; type: string; sourceName?: string }>;
  },
  async lyric(songInfo: SongItem): Promise<{ lyric?: string; tlyric?: string; rlyric?: string; lxlyric?: string; lrc?: string }> {
    try {
      // lxserver: GET with query params (not POST)
      const q = `?source=${encodeURIComponent(songInfo.source)}&songmid=${encodeURIComponent(songInfo.songmid)}&name=${encodeURIComponent(songInfo.name)}&singer=${encodeURIComponent(songInfo.singer)}&hash=${encodeURIComponent(songInfo.hash || '')}&interval=${encodeURIComponent(songInfo.interval || '')}`;
      return (await req('/api/music/lyric' + q)) as { lyric?: string; tlyric?: string; rlyric?: string; lxlyric?: string; lrc?: string };
    } catch { return {}; }
  },


  // ===== 播放器设置云同步(v2 对齐: /api/user/settings) =====
  async settingsPush(data: unknown): Promise<void> {
    await req('/api/user/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  },
  async settingsPull(): Promise<Record<string, unknown> | null> {
    try {
      const d = (await req('/api/user/settings')) as Record<string, unknown> | '';
      return (d && typeof d === 'object' && Object.keys(d).length) ? d : null;
    } catch { return null; }
  },
  // ===== 服务器缓存管理(v2 web 功能对齐) =====
  async cacheStats(): Promise<{ totalSize: number; fileCount: number }> {
    try { return ((await req('/api/music/cache/stats')) as { data?: { totalSize: number; fileCount: number } }).data || { totalSize: 0, fileCount: 0 }; }
    catch { return { totalSize: 0, fileCount: 0 }; }
  },
  async cacheList(): Promise<{ name: string; size: number }[]> {
    try { return ((await req('/api/music/cache/list')) as { data?: { name: string; size: number }[] }).data || []; }
    catch { return []; }
  },
  async cacheClear(): Promise<void> {
    await req('/api/music/cache/clear', { method: 'POST' });
  },
  async cacheDownload(songInfo: SongItem, url: string, quality = '320k'): Promise<void> {
    await req('/api/music/cache/download', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songInfo, url, quality }),
    });
  },
  async songListTags(): Promise<{ tags: { name: string; list: { id: string; name: string }[] }[] }> {
    try {
      const r = await req('/api/music/songList/tags') as unknown as { tags?: { name: string; list: { id: string; name: string }[] } };
      return { tags: Array.isArray(r?.tags) ? r.tags : [] };
    } catch { return { tags: [] }; }
  },
  async songListList(tagId: string, sortId = '5', page = 1, limit = 20): Promise<{ list?: SongListMeta[]; total?: number; limit?: number; allPage?: number }> {
    try {
      const q = `?tagId=${encodeURIComponent(tagId)}&sort=${sortId}&page=${page}&limit=${limit}`;
      return (await req('/api/music/songList/list' + q)) as { list?: SongListMeta[]; total?: number };
    } catch { return {}; }
  },
  async comment(songInfo: SongItem, type: 'hot' | 'new' = 'hot', page = 1, limit = 20): Promise<{ source?: string; comments?: { id: string; text: string; time?: string; timeStr?: string; userName?: string; avatar?: string; likedCount?: number; location?: string }[]; total?: number; allPage?: number; limit?: number }> {
    try {
      return (await req('/api/music/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songInfo, type, page, limit }),
      })) as { source?: string; comments?: { id: string; text: string; timeStr?: string }[] };
    } catch { return {}; }
  },
  async songListDetail(id: string, page = 1, source = 'wy'): Promise<{ list?: SongItem[]; page?: number; limit?: number; total?: number; source?: string; info?: SongListMeta }> {
    try {
      const q = `?id=${encodeURIComponent(id)}&page=${page}&source=${source}`;
      return (await req('/api/music/songList/detail' + q)) as { list?: SongItem[]; source?: string; info?: SongListMeta };
    } catch { return {}; }
  },
  async leaderboardBoards(source = ''): Promise<{ id: string; name: string; bangid: string }[]> {
    try {
      const d = (await req('/api/music/leaderboard/boards' + (source ? `?source=${source}` : ''))) as { list?: { id: string; name: string; bangid: string }[] };
      return d.list || [];
    } catch { return []; }
  },
  async leaderboardList(bangid: string, source = ''): Promise<SongItem[]> {
    try {
      const d = (await req(`/api/music/leaderboard/list?bangid=${encodeURIComponent(bangid)}` + (source ? `&source=${source}` : ''))) as { list?: SongItem[] };
      return d.list || [];
    } catch { return []; }
  },
  async artistSongs(id: string, source = 'wy'): Promise<SongItem[]> {
    try { return (await req(`/api/music/artistSongs?id=${encodeURIComponent(id)}&source=${source}`)) as SongItem[]; } catch { return []; }
  },
  async albumSongs(id: string, source = 'wy'): Promise<SongItem[]> {
    // lx163:服务器 albumSongs 实测返回 {list} 包装(与 artistSongs 裸数组不同),兼容双形态
    try {
      const d = (await req(`/api/music/albumSongs?id=${encodeURIComponent(id)}&source=${source}`)) as SongItem[] | { list?: SongItem[] };
      return Array.isArray(d) ? d : (d.list || []);
    } catch { return []; }
  },
  // lx163:歌手/专辑搜索(服务器 type=singer/album;仅 wy/tx 支持,失败自动换源兑底)
  async searchSingers(kw: string, source = 'kw', page = 1, limit = 30): Promise<{ id: string; name: string; img?: string; source?: string }[]> {
    const trySrc = async (src: string) => {
      // lx163:服务器 type=singer 返回裸数组(wy/tx 实测),兼容 {list} 包装形态
      const d = (await req(`/api/music/search?name=${encodeURIComponent(kw)}&source=${src}&type=singer&page=${page}&limit=${limit}`)) as { list?: { id?: string | number; name: string; picUrl?: string; avatar?: string; img?: string; source?: string }[] } | { id?: string | number; name: string; picUrl?: string; avatar?: string; img?: string; source?: string }[];
      const arr = Array.isArray(d) ? d : (d.list || []);
      return arr.map(a => ({ id: String(a.id ?? a.name), name: a.name, img: a.picUrl || a.avatar || a.img, source: a.source || src }));
    };
    for (const src of [source, 'wy', 'tx']) {
      try { const r = await trySrc(src); if (r.length) return r; } catch { /* 该源不支持/失败,换下一个 */ }
    }
    return [];
  },
  async searchAlbums(kw: string, source = 'kw', page = 1, limit = 30): Promise<{ id: string; name: string; singer?: string; img?: string; source?: string }[]> {
    const trySrc = async (src: string) => {
      // lx163:同 singer,album 也是裸数组
      const d = (await req(`/api/music/search?name=${encodeURIComponent(kw)}&source=${src}&type=album&page=${page}&limit=${limit}`)) as { list?: { id?: string | number; name: string; singer?: string; artistName?: string; picUrl?: string; img?: string; source?: string }[] } | { id?: string | number; name: string; singer?: string; artistName?: string; picUrl?: string; img?: string; source?: string }[];
      const arr = Array.isArray(d) ? d : (d.list || []);
      return arr.map(a => ({ id: String(a.id ?? a.name), name: a.name, singer: a.singer || a.artistName, img: a.picUrl || a.img, source: a.source || src }));
    };
    for (const src of [source, 'wy', 'tx']) {
      try { const r = await trySrc(src); if (r.length) return r; } catch { /* 同上 */ }
    }
    return [];
  },
  async artistAlbums(id: string, source = 'wy'): Promise<{ id: string; name: string; img?: string; publishTime?: string }[]> {
    try {
      const d = (await req(`/api/music/artistAlbums?id=${encodeURIComponent(id)}&source=${source}`)) as { list?: { id?: string | number; name: string; img?: string; picUrl?: string; publishTime?: string }[] };
      return (d.list || []).map(a => ({ id: String(a.id ?? a.name), name: a.name, img: a.img || a.picUrl, publishTime: a.publishTime }));
    } catch { return []; }
  },
  async login(username: string, password: string): Promise<{ success: boolean; token: string; username: string }> {
    const r = (await req('/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })) as { success: boolean; token: string; username: string };
    if (r?.token) saveCreds(username, password); // lx163g:登录成功即存档(供 401 自动重登)
    return r;
  },
  // 创建服务器用户（需服务器 frontend 授权码，对应控制台 x-frontend-auth）
  async createUser(name: string, password: string, frontendAuth: string, base?: string): Promise<true> {
    await req('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-frontend-auth': frontendAuth },
      body: JSON.stringify({ name, password }),
      base,
    });
    return true;
  },
  async verifyUser(): Promise<boolean> {
    try {
      await req('/api/user/auth/verify', { headers: { 'x-user-token': store.token } });
      return true;
    } catch { return false; }
  },
};
