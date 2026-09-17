// 听风音乐（RoCeOS Tingfeng）引擎 — 协议实测 2026-09-16（memory/tingfeng-api.md）
// RoCeOS 路由器内置网易云服务：/api/v1/*，Bearer 认证，song/{id} 出直链 mp3+LRC
// 2026-09-16 改版：并入第三方媒体库体系（providers.ts type='tingfeng'）——本文件只做协议引擎，
// 会话(sess)由调用方持有；token 轮换直接写回 sess，由调用方决定持久化。
// 旧独立屏配置（nextmusic-tingfeng MMKV）仅作一次性迁移源：自动转成 provider 账号。
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from './server';

// 旧单账户配置（迁移源）
const kv = createMMKV({ id: 'nextmusic-tingfeng' });
interface LegacyCfg { base: string; username: string; password: string; accessToken?: string; refreshToken?: string; nickname?: string }
function readLegacy(): LegacyCfg | null {
  try { return JSON.parse(kv.getString('cfg') || 'null'); } catch { return null; }
}
function clearLegacy() { kv.set('cfg', ''); }

export interface TfSess {
  base: string;      // http://10.0.0.1 或 http://op.mubey.top:88
  token?: string;    // accessToken（Bearer）
  refresh?: string;  // refreshToken
  user?: string;     // 账号（供 token 失效自动重登）
  pass?: string;     // 密码（同上）
}

export interface TfSong {
  id: number | string;
  name: string;
  artist: string;
  album?: string;
  url?: string;          // 163 分享页（非播放直链）
  thumbnail?: string;
}

export interface TfPlaylist {
  id: number | string;
  name: string;
  description?: string;
  coverUrl?: string;
  playCount?: number;    // 推荐歌单项有；榜单项无
  trackCount?: number;
  updateTime?: number;
}

export interface TfSongList {
  source: string;        // tolist|playlist|newsong|search
  sourceId: number | string;
  sourceName: string;
  songs: TfSong[];
}

export interface TfSongDetail {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;     // 秒
  thumbnail?: string;
  url: string;           // 直链 mp3（支持 Range，带时效）
  lyrics?: string;       // LRC 全文
}

// ---------- 基础请求 ----------
export function normalizeBase(url: string): string {
  let u = (url || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//.test(u)) u = 'http://' + u;
  return u;
}

async function raw(base: string, path: string, init?: RequestInit & { token?: string; timeout?: number }, timeoutMs?: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs ?? init?.timeout ?? 15000);
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (init?.token) headers['Authorization'] = 'Bearer ' + init.token;
  try {
    return await fetch(base + path, { ...init, headers, signal: ctrl.signal });
  } finally { clearTimeout(t); }
}

interface Envelope<T> { code: number; message?: string; data: T }

/** 登录：成功返回会话所需的双 token + 昵称 */
export async function tfLogin(userInput: string, username: string, password: string): Promise<{ base: string; token: string; refresh: string; nickname: string }> {
  const base = normalizeBase(userInput);
  if (!base) throw new Error('请输入服务器地址');
  const r = await raw(base, '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    timeout: 12000,
  });
  const j = await r.json().catch(() => null) as (Envelope<{ user?: { nickname?: string; username?: string }; accessToken: string; refreshToken: string }> | null);
  if (!j || j.code !== 200 || !j.data?.accessToken) {
    throw new Error(j?.message || '连接失败：账户或密码错误');
  }
  return {
    base,
    token: j.data.accessToken,
    refresh: j.data.refreshToken,
    nickname: j.data.user?.nickname || j.data.user?.username || username,
  };
}

/** 引擎调用：Bearer + 滑动 token 轮换（X-New-Token 写回 sess）+ 401 刷新重放一次 */
export async function tfCall<T>(sess: TfSess, path: string, init?: RequestInit & { timeout?: number }, retried = false): Promise<T> {
  if (!sess.token) throw new Error('听风音乐未连接');
  const r = await raw(sess.base, path, { ...init, token: sess.token }, init?.timeout);
  const nt = r.headers.get('X-New-Token'), nr = r.headers.get('X-New-Refresh-Token');
  if (nt) { sess.token = nt; sess.refresh = nr || sess.refresh; }
  let j: Envelope<T>;
  try { j = await r.json() as Envelope<T>; } catch { throw new Error('听风服务响应异常(' + r.status + ')'); }
  if (r.status === 401 || j.code === 401) {
    if (!retried && !path.includes('/auth/')) {
      if (await tfRefresh(sess)) return tfCall<T>(sess, path, init, true);
      if (await tfRelogin(sess)) return tfCall<T>(sess, path, init, true);
      throw new Error('听风登录已失效，请在媒体库里重新连接');
    }
    throw new Error(j.message || '听风登录已失效');
  }
  if (j.code !== 200) throw new Error(j.message || ('听风接口错误 ' + j.code));
  return j.data;
}

async function tfRefresh(sess: TfSess): Promise<boolean> {
  if (!sess.refresh) return false;
  try {
    const r = await raw(sess.base, '/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: sess.refresh }),
      timeout: 10000,
    });
    const j = await r.json() as Envelope<{ accessToken: string; refreshToken: string }>;
    if (j.code === 200 && j.data?.accessToken) {
      sess.token = j.data.accessToken;
      sess.refresh = j.data.refreshToken;
      return true;
    }
    return false;
  } catch { return false; }
}

/** 服务端重启/升级会同时作废 token+refresh（2026-09-17 RoCeOS 升级实例）：用存储账密自动重登 */
async function tfRelogin(sess: TfSess): Promise<boolean> {
  if (!sess.user || !sess.pass) return false;
  try {
    const r = await tfLogin(sess.base, sess.user, sess.pass);
    sess.token = r.token;
    sess.refresh = r.refresh;
    return true;
  } catch { return false; }
}

// ---------- 端点 ----------
export const tfApi = {
  async profile(sess: TfSess) { return tfCall<{ id: number; username: string; nickname?: string }>(sess, '/api/v1/user/profile'); },
  async toplists(sess: TfSess): Promise<TfPlaylist[]> { return tfCall(sess, '/api/v1/netease/toplist', { timeout: 20000 }); },
  async toplistSongs(sess: TfSess, id: string | number): Promise<TfSongList> { return tfCall(sess, `/api/v1/netease/toplist/${id}/songs`, { timeout: 25000 }); },
  async recommendPlaylists(sess: TfSess, limit = 30): Promise<TfPlaylist[]> { return tfCall(sess, `/api/v1/netease/recommend/playlists?limit=${limit}`, { timeout: 20000 }); },
  async playlistSongs(sess: TfSess, id: string | number): Promise<TfSongList> { return tfCall(sess, `/api/v1/netease/playlist/${id}/songs`, { timeout: 25000 }); },
  async newsongs(sess: TfSess, area = 0): Promise<TfSongList> { return tfCall(sess, `/api/v1/netease/newsong?area=${area}`, { timeout: 20000 }); },
  async search(sess: TfSess, keyword: string, limit = 50, offset = 0): Promise<TfSongList> { return tfCall(sess, `/api/v1/netease/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}&offset=${offset}`, { timeout: 25000 }); },
  async songDetail(sess: TfSess, id: string | number): Promise<TfSongDetail> { return tfCall(sess, `/api/v1/netease/song/${id}`, { timeout: 30000 }); },
};

// ---------- SongItem 映射（source='tf' 走 PlayerProvider 听风取链分支）----------
export const TF_SOURCE = 'tf';

/** songmid 编码：provider 歌带 pid 前缀（pv-xxx:neteaseId），旧数据为裸 neteaseId */
export function tfToSongItem(s: TfSong, pid?: string): SongItem {
  return {
    name: s.name,
    singer: s.artist || '',
    source: TF_SOURCE,
    songmid: pid ? `${pid}:${s.id}` : String(s.id),
    albumId: '',
    interval: '',
    albumName: s.album || '',
    img: s.thumbnail || undefined,
  } as SongItem;
}

/** 解出 {pid, id}：兼容 pid 前缀与旧裸 id */
export function tfSplitMid(mid: string | number | undefined): { pid?: string; id: string } {
  const s = String(mid ?? '');
  const i = s.indexOf(':');
  if (i > 0 && s.startsWith('pv-')) return { pid: s.slice(0, i), id: s.slice(i + 1) };
  return { id: s };
}

// ---------- 账户会话解析（播放/下载/歌词路径用；provider 账号在 providers MMKV）----------
type PersistFn = () => void;
interface TfAcct { id: string; type: 'tingfeng'; base: string; user: string; pass: string; name?: string; token?: string; tfRefresh?: string }
interface ProvidersMod {
  providers: {
    all(): TfAcct[];
    get(id: string): TfAcct | undefined;
    save(a: TfAcct): unknown;
  };
  providerIdentityId(type: string, base: string, user: string): string;
}

/** 惰性取 providers 模块（避免静态环：providers.ts 静态引本文件做引擎） */
async function providersMod(): Promise<ProvidersMod> { return await import('./providers') as unknown as ProvidersMod; }

/**
 * 解析播放用会话：pid 精确匹配 → 唯一 tingfeng 账号 → 旧单账户配置一次性迁移。
 * 返回 sess（token 轮换写回）+ persist（token 变化时回写账号）。
 */
async function resolveSess(pid?: string): Promise<{ sess: TfSess; persist: PersistFn }> {
  const mod = await providersMod();
  const all = mod.providers.all().filter(p => p.type === 'tingfeng');
  let acct = (pid ? all.find(p => p.id === pid) : undefined) || (all.length === 1 ? all[0] : undefined);
  // 旧独立屏配置迁移：用存的账密重新登录，转成正式 provider 账号
  if (!acct) {
    const legacy = readLegacy();
    if (legacy?.base && legacy.username && legacy.password) {
      const r = await tfLogin(legacy.base, legacy.username, legacy.password);
      acct = {
        id: mod.providerIdentityId('tingfeng', r.base, legacy.username),
        type: 'tingfeng', base: r.base, user: legacy.username, pass: legacy.password,
        name: r.nickname, token: r.token, tfRefresh: r.refresh,
      };
      mod.providers.save(acct);
      clearLegacy();
    }
  }
  if (!acct) throw new Error('听风音乐未连接：请在 我的→媒体库 添加');
  const sess: TfSess = { base: acct.base, token: acct.token, refresh: acct.tfRefresh, user: acct.user, pass: acct.pass };
  const origToken = acct.token, origRefresh = acct.tfRefresh;
  return {
    sess,
    persist: () => {
      if (sess.token && (sess.token !== origToken || sess.refresh !== origRefresh)) {
        mod.providers.save({ ...acct, token: sess.token, tfRefresh: sess.refresh });
      }
    },
  };
}

/** 播放/下载取链：song/{id} → 直链 mp3（含 LRC，一并回填）；songmid 兼容 pid 前缀 */
export async function tfSongUrl(song: Pick<SongItem, 'songmid' | 'name'>): Promise<{ url: string; lrc?: string; img?: string; durationSec?: number }> {
  const { pid, id } = tfSplitMid(song.songmid);
  const { sess, persist } = await resolveSess(pid);
  try {
    const d = await tfApi.songDetail(sess, id);
    return { url: d.url, lrc: d.lyrics || undefined, img: d.thumbnail || undefined, durationSec: d.duration };
  } finally { persist(); }
}

/** 歌词：song/{id} 详情自带 LRC 全文 */
export async function tfLyricFor(songmid: string | number): Promise<string | undefined> {
  const { pid, id } = tfSplitMid(songmid);
  const { sess, persist } = await resolveSess(pid);
  try {
    const d = await tfApi.songDetail(sess, id);
    return d.lyrics || undefined;
  } finally { persist(); }
}

// ---------- 用户库同步（听风侧 tingfeng_data：与听风 web 端同库双向，2026-09-16 老板需求） ----------
// 协议：GET/PUT /api/v1/user/tingfeng，likedSongs/recentSongs/playlists 三个 JSON 字符串字段
/** 听风侧列表歌项（存储形态与听风 web 完全一致，双向兼容） */
export interface TfListSong {
  id: number | string; name: string; artist?: string; album?: string;
  url?: string; thumbnail?: string; duration?: number;
}
export interface TfUserPlaylist {
  id: string; name: string; songs: TfListSong[];
  coverUrl?: string; createdAt?: number; updatedAt?: number;
}
export interface TfUserLib { liked: TfListSong[]; recent: TfListSong[]; playlists: TfUserPlaylist[] }

function parseJsonArr(v: unknown): unknown[] {
  try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a : []; } catch { return []; }
}

/** 拉取听风用户库（我喜欢的音乐/最近播放/我的歌单） */
export async function tfUserLib(sess: TfSess): Promise<TfUserLib> {
  const d = await tfCall<Record<string, unknown>>(sess, '/api/v1/user/tingfeng', { timeout: 15000 });
  return {
    liked: parseJsonArr(d.likedSongs) as TfListSong[],
    recent: parseJsonArr(d.recentSongs) as TfListSong[],
    playlists: parseJsonArr(d.playlists) as TfUserPlaylist[],
  };
}

/** 写回听风用户库（部分字段；与听风 web 端 last-writer-wins） */
export async function tfSaveUserLib(
  sess: TfSess,
  lib: Partial<{ likedSongs: TfListSong[]; recentSongs: TfListSong[]; playlists: TfUserPlaylist[] }>,
): Promise<void> {
  const body: Record<string, string> = {};
  if (lib.likedSongs) body.likedSongs = JSON.stringify(lib.likedSongs);
  if (lib.recentSongs) body.recentSongs = JSON.stringify(lib.recentSongs);
  if (lib.playlists) body.playlists = JSON.stringify(lib.playlists);
  await tfCall(sess, '/api/v1/user/tingfeng', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), timeout: 15000,
  });
}

/** 播放埋点：写回听风「最近播放」（最新在前、去重、上限 100，与听风 web 端同策略）；fire-and-forget */
let tfRecentLast = '';
let tfRecentBusy = false;
export async function tfNoteRecent(song: Pick<SongItem, 'songmid' | 'name'>): Promise<void> {
  const { pid, id } = tfSplitMid(song.songmid);
  if (tfRecentLast === id || tfRecentBusy) return;
  tfRecentBusy = true; tfRecentLast = id;
  try {
    const { sess, persist } = await resolveSess(pid);
    try {
      const d = await tfApi.songDetail(sess, id);
      const item: TfListSong = { id: d.id || id, name: d.title || song.name, artist: d.artist, album: d.album, thumbnail: d.thumbnail, duration: d.duration };
      const lib = await tfUserLib(sess);
      const recent = [item, ...lib.recent.filter(s => String(s.id) !== String(item.id))].slice(0, 100);
      await tfSaveUserLib(sess, { recentSongs: recent });
    } finally { persist(); }
  } catch { /* 埋点失败不影响播放 */ } finally { tfRecentBusy = false; }
}
