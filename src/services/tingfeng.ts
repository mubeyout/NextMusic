// 听风音乐（RoCeOS Tingfeng）客户端 — 协议实测 2026-09-16（memory/tingfeng-api.md）
// RoCeOS 路由器内置网易云服务：/api/v1/*，Bearer 认证，song/{id} 出直链 mp3+LRC
// 接入方式：输入服务器地址(ip/域名:端口)+账户密码 → login 拿 token → 浏览/搜索/播放
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from './server';

const kv = createMMKV({ id: 'nextmusic-tingfeng' });

export interface TingfengConfig {
  base: string;          // http://op.mubey.top:88
  username: string;
  password: string;
  accessToken?: string;
  refreshToken?: string;
  nickname?: string;
}

export interface TfSong {
  id: number | string;
  name: string;
  artist: string;
  album?: string;
  url?: string;          // 163 分享页（非播放直链）
  thumbnail?: string;
  provider?: string;
  providerId?: string;
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
  url: string;           // 直链 mp3（支持 Range）
  lyrics?: string;       // LRC 全文
}

// ---------- 配置存取 ----------
function read(): TingfengConfig | null {
  try { return JSON.parse(kv.getString('cfg') || 'null'); } catch { return null; }
}
function write(c: TingfengConfig | null) {
  kv.set('cfg', c ? JSON.stringify(c) : '');
}
export const tingfeng = {
  get config(): TingfengConfig | null { return read(); },
  get connected(): boolean { const c = read(); return !!(c && c.base && c.accessToken); },
  logout() { write(null); },
};

// ---------- 请求（带 token 轮换 + 401 自动刷新一次）----------
function normalizeBase(url: string): string {
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

let refreshInFlight: Promise<boolean> | null = null;
async function refreshTokens(): Promise<boolean> {
  const c = read();
  if (!c || !c.refreshToken) return false;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const r = await raw(c.base, '/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: c.refreshToken }),
        timeout: 10000,
      });
      const j = await r.json() as Envelope<{ accessToken: string; refreshToken: string }>;
      if (j.code === 200 && j.data?.accessToken) {
        write({ ...c, accessToken: j.data.accessToken, refreshToken: j.data.refreshToken });
        return true;
      }
      return false;
    } catch { return false; }
    finally { setTimeout(() => { refreshInFlight = null; }, 1000); }
  })();
  return refreshInFlight;
}

/** 底层 API 调用：处理 token 轮换头 + 401 刷新重放 + code!==200 抛错 */
async function call<T>(path: string, init?: RequestInit & { timeout?: number }, retried = false): Promise<T> {
  const c = read();
  if (!c) throw new Error('听风音乐未连接');
  const r = await raw(c.base, path, { ...init, token: c.accessToken }, init?.timeout);
  // 滑动 token 轮换（RoCeOS 前端同款行为）
  const nt = r.headers.get('X-New-Token'), nr = r.headers.get('X-New-Refresh-Token');
  if (nt) write({ ...c, accessToken: nt, refreshToken: nr || c.refreshToken });
  let j: Envelope<T>;
  try { j = await r.json() as Envelope<T>; } catch { throw new Error('听风服务响应异常(' + r.status + ')'); }
  if (r.status === 401 || j.code === 401) {
    if (!retried && !path.includes('/auth/')) {
      if (await refreshTokens()) return call<T>(path, init, true);
      throw new Error('听风登录已失效，请重新连接');
    }
    throw new Error(j.message || '听风登录已失效');
  }
  if (j.code !== 200) throw new Error(j.message || ('听风接口错误 ' + j.code));
  return j.data;
}

// ---------- 公开 API ----------
export const tfApi = {
  normalizeBase,

  /** 登录并保存配置（base 形如 op.mubey.top:88 或 http://10.0.0.1） */
  async connect(rawBase: string, username: string, password: string): Promise<{ nickname: string }> {
    const base = normalizeBase(rawBase);
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
    const nickname = j.data.user?.nickname || j.data.user?.username || username;
    write({ base, username, password, accessToken: j.data.accessToken, refreshToken: j.data.refreshToken, nickname });
    return { nickname };
  },

  async profile(): Promise<{ id: number; username: string; nickname?: string; avatar?: string }> {
    return call('/api/v1/user/profile');
  },

  async toplists(): Promise<TfPlaylist[]> {
    return call('/api/v1/netease/toplist', { timeout: 20000 });
  },
  async toplistSongs(id: string | number): Promise<TfSongList> {
    return call(`/api/v1/netease/toplist/${id}/songs`, { timeout: 25000 });
  },
  async recommendPlaylists(limit = 30): Promise<TfPlaylist[]> {
    return call(`/api/v1/netease/recommend/playlists?limit=${limit}`, { timeout: 20000 });
  },
  async playlistSongs(id: string | number): Promise<TfSongList> {
    return call(`/api/v1/netease/playlist/${id}/songs`, { timeout: 25000 });
  },
  async newsongs(area = 0): Promise<TfSongList> {
    return call(`/api/v1/netease/newsong?area=${area}`, { timeout: 20000 });
  },
  async search(keyword: string, limit = 50, offset = 0): Promise<TfSongList> {
    return call(`/api/v1/netease/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}&offset=${offset}`, { timeout: 25000 });
  },
  async songDetail(id: string | number): Promise<TfSongDetail> {
    return call(`/api/v1/netease/song/${id}`, { timeout: 30000 });
  },
};

// ---------- SongItem 映射（source='tf' 走 PlayerProvider 听风取链分支）----------
export const TF_SOURCE = 'tf';

function fmtInterval(sec?: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function tfToSongItem(s: TfSong): SongItem {
  return {
    name: s.name,
    singer: s.artist || '',
    source: TF_SOURCE,
    songmid: String(s.id),
    albumId: '',
    interval: '',
    albumName: s.album || '',
    img: s.thumbnail || undefined,
  };
}

/** 播放/下载取链：song/{id} → 直链 mp3（含 LRC，一并回填） */
export async function tfSongUrl(song: Pick<SongItem, 'songmid' | 'name'>): Promise<{ url: string; lrc?: string; img?: string; durationSec?: number }> {
  const d = await tfApi.songDetail(song.songmid);
  return { url: d.url, lrc: d.lyrics || undefined, img: d.thumbnail || undefined, durationSec: d.duration };
}
