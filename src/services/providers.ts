// 第三方媒体库接入：Subsonic(Navidrome/道理鱼/Subsonic) · Emby · Jellyfin · WebDAV · 听风(RoCeOS 网易云)
// 账号持久化在 MMKV；对外统一输出 SongItem（provider 系 source = provider 类型，songmid = "pid:itemId"；听风 source='tf'）
// 播放/下载统一走 streamUrlFor() + authHeadersFor()（听风除外：直链需异步现取，PlayerProvider 前置分支处理）
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from './server';
import { tfLogin, tfCall, tfToSongItem, tfUserLib, type TfSess, type TfSongList, type TfPlaylist } from './tingfeng';

const kv = createMMKV({ id: 'nextmusic-providers' });

export type ProviderType = 'subsonic' | 'navidrome' | 'daoliyu' | 'emby' | 'jellyfin' | 'webdav' | 'tingfeng';

// 协议映射：navidrome / 道理鱼 走 Subsonic 协议
export const PROTOCOL: Record<ProviderType, 'subsonic' | 'emby' | 'jellyfin' | 'webdav' | 'tingfeng'> = {
  subsonic: 'subsonic', navidrome: 'subsonic', daoliyu: 'subsonic',
  emby: 'emby', jellyfin: 'jellyfin', webdav: 'webdav',
  tingfeng: 'tingfeng',
};

export interface ProviderAcct {
  id: string;
  type: ProviderType;
  name: string;        // 显示名（如 "客厅 Navidrome"）
  base: string;        // 服务器地址
  user: string;
  pass: string;
  // 运行时缓存（登录后获得）
  token?: string;      // emby/jellyfin AccessToken
  userId?: string;     // emby/jellyfin User.Id
  root?: string;       // 探测出的 API 根路径（emby 可能带 /emby）
  tfRefresh?: string;  // 听风 refreshToken（token 轮换/刷新用；accessToken 在 token 字段）
}

export const PROVIDER_META: Record<ProviderType, { label: string; hint: string; placeholder: string }> = {
  subsonic: { label: 'Subsonic', hint: 'Subsonic 服务器（原生）', placeholder: 'http://192.168.1.10:4040' },
  navidrome: { label: 'Navidrome', hint: 'Navidrome 音乐服务器（Subsonic 兼容）', placeholder: 'http://192.168.1.10:4533' },
  daoliyu: { label: '道理鱼音乐', hint: '道理鱼（Subsonic 兼容，NAS 自建音乐库）', placeholder: 'http://192.168.1.10:4533' },
  emby: { label: 'Emby', hint: 'Emby 媒体服务器（音乐库）', placeholder: 'http://192.168.1.10:8096' },
  jellyfin: { label: 'Jellyfin', hint: 'Jellyfin 媒体服务器（音乐库）', placeholder: 'http://192.168.1.10:8096' },
  webdav: { label: 'WebDAV', hint: 'NAS / 飞牛 fnOS / Alist 等 WebDAV 共享目录，直接浏览音频文件', placeholder: 'http://192.168.1.10:5244/dav' },
  tingfeng: { label: '听风音乐', hint: 'RoCeOS / iStoreOS 路由器内置网易云服务（推荐歌单/排行榜/新歌）', placeholder: 'http://192.168.1.1 或 op.example.com:88' },
};

// 判断歌曲是否来自第三方媒体库（source ∈ 协议表 keys；subsonic 系歌实际 source 为 'subsonic'；听风歌 source='tf' 不在此列——它走独立取链分支）
export function isProviderSongSource(src?: string): boolean {
  return !!src && !!PROTOCOL[src as ProviderType];
}

// ---------- accounts CRUD ----------
function readAll(): ProviderAcct[] {
  try { return JSON.parse(kv.getString('accounts') || '[]'); } catch { return []; }
}
function writeAll(list: ProviderAcct[]) { kv.set('accounts', JSON.stringify(list)); }

export const providers = {
  all: readAll,
  get(id: string) { return readAll().find(p => p.id === id); },
  save(acct: ProviderAcct) {
    const list = readAll();
    const i = list.findIndex(p => p.id === acct.id);
    if (i >= 0) list[i] = acct; else list.push(acct);
    writeAll(list);
    return acct;
  },
  remove(id: string) { writeAll(readAll().filter(p => p.id !== id)); },
};

// ---------- helpers ----------
function norm(base: string): string { return base.trim().replace(/\/+$/, ''); }
/** 安全解码：含原生 % 的文件名（如 "100%.mp3"）decodeURIComponent 会 throw，需兜底 */
function safeDec(s: string): string { try { return decodeURIComponent(s); } catch { return s; } }

// 稳定身份 id：同一「服务器+账号」重复添加得到相同 id——删除后重连，已导入歌曲（songmid=pid:itemId）全部自动复活
// djb2 哈希足够：个人使用场景碰撞概率可忽略；同服务器同账号重复添加会被 upsert 去重（合理语义）
export function providerIdentityId(type: ProviderType, base: string, user: string): string {
  const key = `${norm(base).toLowerCase()}|${user.toLowerCase()}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
  return `pv-${type}-${h.toString(16)}`;
}

export function basicAuth(a: { user: string; pass: string }): Record<string, string> {
  return { Authorization: 'Basic ' + btoaUtf8(`${a.user}:${a.pass}`) };
}

// RN 无 btoa；手写 UTF-8 base64
function btoaUtf8(s: string): string {
  const bytes: number[] = [];
  for (const ch of s) {
    let cp = ch.codePointAt(0)!;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xC0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) bytes.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else { bytes.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)); cp = 0; }
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += chars[b0 >> 2] + chars[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 == null ? '=' : chars[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 == null ? '=' : chars[b2 & 63];
  }
  return out;
}

function md5(input: string): string {
  // Subsonic token = md5(password + salt)；用引擎内已有的 md5？简化：引 react-native-quick-md5 不现实。
  // 这里用纯 JS 实现（小数据量，性能足够）
  return jsMd5(input);
}

function jsMd5(str: string): string {
  function rl(n: number, c: number) { return (n << c) | (n >>> (32 - c)); }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    a = (((a + q) | 0) + ((x + t) | 0)) | 0;
    return ((rl(a, s) + b) | 0);
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
  // to UTF-8 bytes
  const msg: number[] = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) msg.push(cp);
    else if (cp < 0x800) msg.push(0xC0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) msg.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else msg.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  const nblk = ((msg.length + 8) >> 6) + 1;
  const blks: number[] = new Array(nblk * 16).fill(0);
  for (let i = 0; i < msg.length; i++) blks[i >> 2] |= msg[i] << ((i % 4) * 8);
  blks[msg.length >> 2] |= 0x80 << ((msg.length % 4) * 8);
  blks[nblk * 16 - 2] = msg.length * 8;
  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < blks.length; i += 16) {
    const [oa, ob, oc, od] = [a, b, c, d];
    a = ff(a, b, c, d, blks[i + 0], 7, -680876936);
    d = ff(d, a, b, c, blks[i + 1], 12, -389564586);
    c = ff(c, d, a, b, blks[i + 2], 17, 606105819);
    b = ff(b, c, d, a, blks[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, blks[i + 4], 7, -176418897);
    d = ff(d, a, b, c, blks[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, blks[i + 6], 17, -1473231341);
    b = ff(b, c, d, a, blks[i + 7], 22, -45705983);
    a = ff(a, b, c, d, blks[i + 8], 7, 1770035416);
    d = ff(d, a, b, c, blks[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, blks[i + 10], 17, -42063);
    b = ff(b, c, d, a, blks[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, blks[i + 12], 7, 1804603682);
    d = ff(d, a, b, c, blks[i + 13], 12, -40341101);
    c = ff(c, d, a, b, blks[i + 14], 17, -1502002290);
    b = ff(b, c, d, a, blks[i + 15], 22, 1236535329);
    a = gg(a, b, c, d, blks[i + 1], 5, -165796510);
    d = gg(d, a, b, c, blks[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, blks[i + 11], 14, 643717713);
    b = gg(b, c, d, a, blks[i + 0], 20, -373897302);
    a = gg(a, b, c, d, blks[i + 5], 5, -701558691);
    d = gg(d, a, b, c, blks[i + 10], 9, 38016083);
    c = gg(c, d, a, b, blks[i + 15], 14, -660478335);
    b = gg(b, c, d, a, blks[i + 4], 20, -405537848);
    a = gg(a, b, c, d, blks[i + 9], 5, 568446438);
    d = gg(d, a, b, c, blks[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, blks[i + 3], 14, -187363961);
    b = gg(b, c, d, a, blks[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, blks[i + 13], 5, -1444681467);
    d = gg(d, a, b, c, blks[i + 2], 9, -51403784);
    c = gg(c, d, a, b, blks[i + 7], 14, 1735328473);
    b = gg(b, c, d, a, blks[i + 12], 20, -1926607734);
    a = hh(a, b, c, d, blks[i + 5], 4, -378558);
    d = hh(d, a, b, c, blks[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, blks[i + 11], 16, 1839030562);
    b = hh(b, c, d, a, blks[i + 14], 23, -35309556);
    a = hh(a, b, c, d, blks[i + 1], 4, -1530992060);
    d = hh(d, a, b, c, blks[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, blks[i + 7], 16, -155497632);
    b = hh(b, c, d, a, blks[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, blks[i + 13], 4, 681279174);
    d = hh(d, a, b, c, blks[i + 0], 11, -358537222);
    c = hh(c, d, a, b, blks[i + 3], 16, -722521979);
    b = hh(b, c, d, a, blks[i + 6], 23, 76029189);
    a = hh(a, b, c, d, blks[i + 9], 4, -640364487);
    d = hh(d, a, b, c, blks[i + 12], 11, -421815835);
    c = hh(c, d, a, b, blks[i + 15], 16, 530742520);
    b = hh(b, c, d, a, blks[i + 2], 23, -995338651);
    a = ii(a, b, c, d, blks[i + 0], 6, -198630844);
    d = ii(d, a, b, c, blks[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, blks[i + 14], 15, -1416354905);
    b = ii(b, c, d, a, blks[i + 5], 21, -57434055);
    a = ii(a, b, c, d, blks[i + 12], 6, 1700485571);
    d = ii(d, a, b, c, blks[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, blks[i + 10], 15, -1051523);
    b = ii(b, c, d, a, blks[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, blks[i + 8], 6, 1873313359);
    d = ii(d, a, b, c, blks[i + 15], 10, -30611744);
    c = ii(c, d, a, b, blks[i + 6], 15, -1560198380);
    b = ii(b, c, d, a, blks[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, blks[i + 4], 6, -145523070);
    d = ii(d, a, b, c, blks[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, blks[i + 2], 15, 718787259);
    b = ii(b, c, d, a, blks[i + 9], 21, -343485551);
    a = (a + oa) | 0; b = (b + ob) | 0; c = (c + oc) | 0; d = (d + od) | 0;
  }
  const hex = (x: number) => {
    let s = '';
    for (let i = 0; i < 4; i++) s += ((x >> (i * 8 + 4)) & 15).toString(16) + ((x >> (i * 8)) & 15).toString(16);
    return s;
  };
  return hex(a) + hex(b) + hex(c) + hex(d);
}

function pad2(n: number) { return n < 10 ? '0' + n : '' + n; }
function fmtSec(sec?: number): string {
  if (!sec || !isFinite(sec)) return '';
  return `${Math.floor(sec / 60)}:${pad2(Math.floor(sec % 60))}`;
}

// ---------- Subsonic (Navidrome / 道理鱼 / Subsonic) ----------
function subParams(a: ProviderAcct): Record<string, string> {
  const salt = Math.random().toString(36).slice(2, 10);
  return { u: a.user, t: md5(a.pass + salt), s: salt, v: '1.16.1', c: 'NextMusic', f: 'json' };
}
function subUrl(a: ProviderAcct, method: string, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ ...subParams(a), ...extra } as Record<string, string>);
  return `${norm(a.base)}/rest/${method}?${q.toString()}`;
}
async function subCall<T = unknown>(a: ProviderAcct, method: string, extra: Record<string, string> = {}, timeout = 10000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(subUrl(a, method, extra), { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const sub = (d as { 'subsonic-response'?: { status?: string; error?: { code?: number; message?: string } } })['subsonic-response'];
    if (!sub || sub.status !== 'ok') throw new Error(sub?.error?.message || '认证失败或服务器不支持 Subsonic API');
    return sub as T;
  } finally { clearTimeout(t); }
}

// ---------- Emby / Jellyfin ----------
function embyRoot(a: ProviderAcct): string {
  if (a.root) return a.root;
  return a.type === 'emby' ? `${norm(a.base)}/emby` : norm(a.base);
}
function embyHeaders(a: ProviderAcct): Record<string, string> {
  return a.token ? { 'X-Emby-Token': a.token } : {};
}
async function embyFetch(a: ProviderAcct, path: string, init?: RequestInit & { root?: string; timeout?: number }): Promise<unknown> {
  const root = init?.root || embyRoot(a);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeout ?? 12000);
  try {
    const r = await fetch(root + path, {
      ...init,
      headers: { ...(init?.headers as Record<string, string> | undefined), ...embyHeaders(a) },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    try { return JSON.parse(text); } catch { return text; }
  } finally { clearTimeout(t); }
}

// ---------- 对外 API ----------
export interface PvArtist { id: string; name: string; albumCount?: number; cover?: string }
export interface PvAlbum { id: string; name: string; artist?: string; songCount?: number; cover?: string; year?: number }
export interface PvPlaylist { id: string; name: string; songCount?: number; cover?: string }

// Subsonic song → SongItem（getAlbum/getPlaylist/getRandomSongs 共用）
function mapSubSong(a: ProviderAcct, pid: string, s: Record<string, unknown>, albumId?: string): SongItem {
  return {
    name: String(s.title || s.album || '未知曲目'),
    singer: String(s.artist || ''),
    source: 'subsonic',
    songmid: `${pid}:${s.id}`,
    albumId: String(s.albumId || albumId || ''),
    albumName: s.album ? String(s.album) : undefined,
    interval: fmtSec(Number(s.duration)),
    img: s.coverArt ? subUrl(a, 'getCoverArt', { id: String(s.coverArt), size: '300' }) : undefined,
  } as SongItem;
}
// Emby/Jellyfin item → SongItem（专辑/歌单/随机 共用）
function mapEmbySong(a: ProviderAcct, pid: string, it: Record<string, unknown>, albumId?: string): SongItem {
  return {
    name: String(it.Name || '未知曲目'),
    singer: it.Artists ? String((it.Artists as string[]).join(', ')) : (it.AlbumArtist ? String(it.AlbumArtist) : ''),
    source: a.type,
    songmid: `${pid}:${it.Id}`,
    albumId: albumId || '',
    albumName: it.Album ? String(it.Album) : undefined,
    interval: fmtSec(Number(it.RunTimeTicks) / 10000000),
    container: it.Container ? String(it.Container).toLowerCase() : undefined,
    img: (it.ImageTags as Record<string, string> | undefined)?.Primary
      ? `${embyRoot(a)}/Items/${it.Id}/Images/Primary?maxWidth=300${a.token ? `&api_key=${a.token}` : ''}`
      : undefined,
  } as SongItem;
}

/** 转码流（Emby/JF）：PlaySessionId 必须唯一 —— Emby 按 session 命名转码临时目录，缺省时重试 job 会复用同一目录互删文件（实测 ffmpeg exit 1） */
function transcodeUrlFor(a: ProviderAcct, itemId: string): { url: string; headers?: Record<string, string> } {
  const psid = 'nm' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  return { url: `${embyRoot(a)}/Audio/${itemId}/stream.mp3?audioBitRate=320&PlaySessionId=${psid}`, headers: embyHeaders(a) };
}

/** ExoPlayer 可直解的音频容器；其余（ape/wma/alac/aiff…）直流必败，只能转码 */
const DIRECT_PLAY_OK = new Set(['mp3', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'wav', 'webma', 'webm']);

/** 听风引擎包装：会话从账号构建，token 轮换/刷新后回写账号（finally 保证异常也持久化） */
async function tfRun<T>(a: ProviderAcct, fn: (s: TfSess) => Promise<T>): Promise<T> {
  const sess: TfSess = { base: a.base, token: a.token, refresh: a.tfRefresh };
  try {
    return await fn(sess);
  } finally {
    if (sess.token && (sess.token !== a.token || sess.refresh !== a.tfRefresh)) {
      providers.save({ ...a, token: sess.token, tfRefresh: sess.refresh });
    }
  }
}

export const providerApi = {
  /** 连接测试 + 登录（成功返回更新后的账号，含 token/userId） */
  async connect(a: ProviderAcct): Promise<ProviderAcct> {
    const base = norm(a.base);
    if (a.type === 'tingfeng') {
      const r = await tfLogin(base, a.user, a.pass);
      return { ...a, base: r.base, token: r.token, tfRefresh: r.refresh, name: a.name.trim() || r.nickname || '听风音乐' };
    }
    if (PROTOCOL[a.type] === 'subsonic') {
      await subCall(a, 'ping'); // throws on failure
      return { ...a, base };
    }
    if (a.type === 'webdav') {
      await providerApi.webdavList({ ...a, base }, '/');
      return { ...a, base };
    }
    // emby / jellyfin：探测 API 根，再登录
    const roots = a.type === 'emby'
      ? [`${base}/emby`, base] // emby 常见带 /emby 前缀
      : [base, `${base}/jellyfin`];
    const authHeader = {
      'X-Emby-Authorization': 'MediaBrowser Client="NextMusic", Device="Android", DeviceId="nextmusic-mobile", Version="3.2.0"',
      'Content-Type': 'application/json',
    };
    let lastErr: Error | null = null;
    for (const root of roots) {
      try {
        const d = (await embyFetch({ ...a }, '/Users/AuthenticateByName', {
          root, method: 'POST', headers: authHeader, timeout: 10000,
          body: JSON.stringify({ Username: a.user, Pw: a.pass }),
        })) as { AccessToken?: string; User?: { Id?: string } };
        if (!d.AccessToken || !d.User?.Id) throw new Error('登录失败：账号或密码错误');
        return { ...a, base, root, token: d.AccessToken, userId: d.User.Id };
      } catch (e) { lastErr = e as Error; }
    }
    throw lastErr || new Error('连接失败');
  },

  /** 专辑列表（P0 浏览页「专辑」段；听风无专辑概念→空） */
  async albums(a: ProviderAcct): Promise<PvAlbum[]> {
    if (a.type === 'tingfeng') return [];
    if (PROTOCOL[a.type] === 'subsonic') {
      const d = await subCall<{ albumList2?: { album?: Record<string, unknown>[] } }>(a, 'getAlbumList2', { type: 'alphabeticalByName', size: '200' });
      return (d.albumList2?.album || []).map(al => ({
        id: String(al.id), name: String(al.name || ''),
        artist: al.artist ? String(al.artist) : undefined,
        songCount: al.songCount ? Number(al.songCount) : undefined,
        year: al.year ? Number(al.year) : undefined,
        cover: al.coverArt ? subUrl(a, 'getCoverArt', { id: String(al.coverArt), size: '300' }) : undefined,
      }));
    }
    if (PROTOCOL[a.type] === 'emby' || PROTOCOL[a.type] === 'jellyfin') {
      const d = (await embyFetch(a, `/Users/${a.userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=SortName&Limit=300&Fields=PrimaryImageAspectRatio,ImageTags`)) as { Items?: Record<string, unknown>[] };
      return (d.Items || []).map(it => ({
        id: String(it.Id), name: String(it.Name || ''),
        artist: it.AlbumArtist ? String(it.AlbumArtist) : (it.Artists ? String((it.Artists as string[])[0] || '') : undefined),
        songCount: it.ChildCount ? Number(it.ChildCount) : undefined,
        year: it.ProductionYear ? Number(it.ProductionYear) : undefined,
        cover: ((it.ImageTags as Record<string, string> | undefined)?.Primary) ? `${embyRoot(a)}/Items/${it.Id}/Images/Primary?maxWidth=300${a.token ? `&api_key=${a.token}` : ''}` : undefined, // 仅 Primary 存在才构造(无封面请求 404→灰块)
      }));
    }
    return [];
  },

  /** 艺术家列表（浏览页「艺术家」段；听风无→空） */
  async artists(a: ProviderAcct): Promise<PvArtist[]> {
    if (a.type === 'tingfeng') return [];
    if (PROTOCOL[a.type] === 'subsonic') {
      const d = await subCall<{ artists?: { index?: { artist?: Record<string, unknown>[] }[] } }>(a, 'getArtists');
      const flat = (d.artists?.index || []).flatMap(ix => ix.artist || []);
      return flat.map(ar => ({
        id: String(ar.id), name: String(ar.name || ''),
        albumCount: ar.albumCount ? Number(ar.albumCount) : undefined,
        cover: ar.coverArt ? subUrl(a, 'getCoverArt', { id: String(ar.coverArt), size: '300' }) : undefined,
      }));
    }
    if (PROTOCOL[a.type] === 'emby' || PROTOCOL[a.type] === 'jellyfin') {
      const d = (await embyFetch(a, `/Users/${a.userId}/Items?IncludeItemTypes=MusicArtist&Recursive=true&SortBy=SortName&Limit=300`)) as { Items?: Record<string, unknown>[] };
      return (d.Items || []).map(it => ({
        id: String(it.Id), name: String(it.Name || ''),
        cover: (it.ImageTags as Record<string, string> | undefined)?.Primary
          ? `${embyRoot(a)}/Items/${it.Id}/Images/Primary?maxWidth=300${a.token ? `&api_key=${a.token}` : ''}`
          : undefined,
      }));
    }
    return [];
  },

  /** 某艺术家的专辑（艺术家详情页；听风无→空） */
  async artistAlbums(a: ProviderAcct, artistId: string): Promise<PvAlbum[]> {
    if (a.type === 'tingfeng') return [];
    if (PROTOCOL[a.type] === 'subsonic') {
      const d = await subCall<{ artist?: { album?: Record<string, unknown>[] } }>(a, 'getArtist', { id: artistId });
      return (d.artist?.album || []).map(al => ({
        id: String(al.id), name: String(al.name || ''),
        songCount: al.songCount ? Number(al.songCount) : undefined,
        year: al.year ? Number(al.year) : undefined,
        cover: al.coverArt ? subUrl(a, 'getCoverArt', { id: String(al.coverArt), size: '300' }) : undefined,
      }));
    }
    if (PROTOCOL[a.type] === 'emby' || PROTOCOL[a.type] === 'jellyfin') {
      const d = (await embyFetch(a, `/Users/${a.userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&AlbumArtistIds=${artistId}&SortBy=ProductionYear&SortOrder=Descending&Limit=100`)) as { Items?: Record<string, unknown>[] };
      return (d.Items || []).map(it => ({
        id: String(it.Id), name: String(it.Name || ''),
        songCount: it.ChildCount ? Number(it.ChildCount) : undefined,
        year: it.ProductionYear ? Number(it.ProductionYear) : undefined,
        cover: ((it.ImageTags as Record<string, string> | undefined)?.Primary) ? `${embyRoot(a)}/Items/${it.Id}/Images/Primary?maxWidth=300${a.token ? `&api_key=${a.token}` : ''}` : undefined, // 仅 Primary 存在才构造(无封面请求 404→灰块)
      }));
    }
    return [];
  },

  /** 随机歌曲（浏览页「歌曲」段，换一批即重调；听风=新歌速递，客户端乱序充当"换一批"） */
  async randomSongs(a: ProviderAcct, size = 100): Promise<SongItem[]> {
    const pid = a.id;
    if (a.type === 'tingfeng') {
      return tfRun(a, async s => {
        const d = await tfCall<TfSongList>(s, '/api/v1/netease/newsong?area=0', { timeout: 20000 });
        const arr = d.songs.map(x => tfToSongItem(x, pid));
        for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; }
        return arr;
      });
    }
    if (PROTOCOL[a.type] === 'subsonic') {
      const d = await subCall<{ randomSongs?: { song?: Record<string, unknown>[] } }>(a, 'getRandomSongs', { size: String(size) });
      return (d.randomSongs?.song || []).map(s => mapSubSong(a, pid, s));
    }
    if (PROTOCOL[a.type] === 'emby' || PROTOCOL[a.type] === 'jellyfin') {
      const d = (await embyFetch(a, `/Users/${a.userId}/Items?IncludeItemTypes=Audio&Recursive=true&SortBy=Random&Limit=${size}&Fields=Container`)) as { Items?: Record<string, unknown>[] };
      return (d.Items || []).map(it => mapEmbySong(a, pid, it));
    }
    return [];
  },

  /** 服务器端歌单列表（浏览页「歌单」段；听风=我喜欢的音乐+最近播放+我的歌单+推荐歌单+排行榜，id 前缀 liked:/recent:/mine:/pl:/top: 区分） */
  async playlists(a: ProviderAcct): Promise<PvPlaylist[]> {
    if (a.type === 'tingfeng') {
      return tfRun(a, async s => {
        // 用户库（听风侧 tingfeng_data，与听风 web 端同库双向）
        let lib: Awaited<ReturnType<typeof tfUserLib>> | null = null;
        try { lib = await tfUserLib(s); } catch { /* 用户库拉不到不影响公共榜单 */ }
        const user: PvPlaylist[] = lib ? [
          { id: 'liked:', name: '我喜欢的音乐', songCount: lib.liked.length, cover: lib.liked[0]?.thumbnail },
          { id: 'recent:', name: '最近播放', songCount: lib.recent.length, cover: lib.recent[0]?.thumbnail },
          ...lib.playlists.map(p => ({ id: `mine:${p.id}`, name: p.name, songCount: p.songs.length, cover: p.coverUrl || p.songs[0]?.thumbnail })),
        ] : [];
        const tops = await tfCall<TfPlaylist[]>(s, '/api/v1/netease/toplist', { timeout: 20000 });
        let recs: TfPlaylist[] = [];
        try { recs = await tfCall<TfPlaylist[]>(s, '/api/v1/netease/recommend/playlists?limit=30', { timeout: 20000 }); } catch { /* 推荐拉不到至少榜单可用 */ }
        return [
          ...user,
          ...recs.map(p => ({ id: `pl:${p.id}`, name: p.name, songCount: p.trackCount, cover: p.coverUrl })),
          ...tops.map(t => ({ id: `top:${t.id}`, name: t.name, cover: t.coverUrl })),
        ];
      });
    }
    if (PROTOCOL[a.type] === 'subsonic') {
      const d = await subCall<{ playlists?: { playlist?: Record<string, unknown>[] } }>(a, 'getPlaylists');
      return (d.playlists?.playlist || []).map(pl => ({
        id: String(pl.id), name: String(pl.name || ''),
        songCount: pl.songCount ? Number(pl.songCount) : undefined,
        cover: pl.coverArt ? subUrl(a, 'getCoverArt', { id: String(pl.coverArt), size: '300' }) : undefined,
      }));
    }
    if (PROTOCOL[a.type] === 'emby' || PROTOCOL[a.type] === 'jellyfin') {
      const d = (await embyFetch(a, `/Users/${a.userId}/Items?IncludeItemTypes=Playlist&Recursive=true&SortBy=SortName&Limit=200&Fields=MediaType`)) as { Items?: Record<string, unknown>[] };
      // 音乐歌单才展示（Emby 视频歌单 MediaType=Video；无 MediaType 字段的老服务器不过滤）
      return (d.Items || [])
        .filter(it => it.MediaType == null || String(it.MediaType) === 'Audio')
        .map(it => ({
          id: String(it.Id), name: String(it.Name || ''),
          songCount: it.ChildCount ? Number(it.ChildCount) : undefined,
        }));
    }
    return [];
  },

  /** 服务器歌单曲目（听风：liked:/recent:/mine: 走用户库；top: 前缀走榜单接口，其余走歌单接口） */
  async playlistSongs(a: ProviderAcct, playlistId: string): Promise<SongItem[]> {
    const pid = a.id;
    if (a.type === 'tingfeng') {
      return tfRun(a, async s => {
        // 用户库歌单（听风侧数据直接映射）
        if (playlistId === 'liked:' || playlistId === 'recent:') {
          const lib = await tfUserLib(s);
          const arr = playlistId === 'liked:' ? lib.liked : lib.recent;
          return arr.map(x => tfToSongItem(x as never, pid));
        }
        if (playlistId.startsWith('mine:')) {
          const lib = await tfUserLib(s);
          const pl = lib.playlists.find(p => `mine:${p.id}` === playlistId);
          return (pl?.songs || []).map(x => tfToSongItem(x as never, pid));
        }
        const isTop = playlistId.startsWith('top:');
        const realId = playlistId.replace(/^(top:|pl:)/, '');
        const d = await tfCall<TfSongList>(s, `/api/v1/netease/${isTop ? 'toplist' : 'playlist'}/${realId}/songs`, { timeout: 25000 });
        return d.songs.map(x => tfToSongItem(x, pid));
      });
    }
    if (PROTOCOL[a.type] === 'subsonic') {
      const d = await subCall<{ playlist?: { entry?: Record<string, unknown>[] } }>(a, 'getPlaylist', { id: playlistId });
      return (d.playlist?.entry || []).map(s => mapSubSong(a, pid, s));
    }
    if (PROTOCOL[a.type] === 'emby' || PROTOCOL[a.type] === 'jellyfin') {
      const d = (await embyFetch(a, `/Users/${a.userId}/Items?ParentId=${playlistId}&IncludeItemTypes=Audio&SortBy=ParentIndexNumber,IndexNumber,SortName&Limit=500&Fields=Container`)) as { Items?: Record<string, unknown>[] };
      return (d.Items || []).map(it => mapEmbySong(a, pid, it));
    }
    return [];
  },

  /** 专辑内歌曲（复用映射助手；听风无→空） */
  async albumSongs(a: ProviderAcct, albumId: string): Promise<SongItem[]> {
    const pid = a.id;
    if (a.type === 'tingfeng') return [];
    if (PROTOCOL[a.type] === 'subsonic') {
      const d = await subCall<{ album?: { song?: Record<string, unknown>[] } }>(a, 'getAlbum', { id: albumId });
      return (d.album?.song || []).map(s => mapSubSong(a, pid, s, albumId));
    }
    if (PROTOCOL[a.type] === 'emby' || PROTOCOL[a.type] === 'jellyfin') {
      const d = (await embyFetch(a, `/Users/${a.userId}/Items?ParentId=${albumId}&IncludeItemTypes=Audio&SortBy=ParentIndexNumber,IndexNumber,SortName&Limit=500&Fields=Container`)) as { Items?: Record<string, unknown>[] };
      return (d.Items || []).map(it => mapEmbySong(a, pid, it, albumId));
    }
    return [];
  },

  /** 播放/下载地址 + 请求头 */
  streamFor(song: SongItem): { url: string; headers?: Record<string, string> } | null {
    const src = song.source;
    const mid = String(song.songmid ?? ''); // 历史数据 songmid 可能为 number，统一转 string
    if (src === 'webdav') {
      const a = providers.all().find(p => p.type === 'webdav' && (mid.startsWith(norm(p.base)) || safeDec(mid).startsWith(safeDec(norm(p.base)))));
      return { url: mid, headers: a ? basicAuth(a) : undefined };
    }
    const [pid, itemId] = mid.split(':');
    let a = providers.get(pid);
    // pid 已不存在（重连换 id 的旧歌单）：同协议只剩一个账号时直接复用——itemId 在同一服务器上仍然有效
    // 注意协议级匹配：navidrome/道理鱼账号的歌 source='subsonic'，按 type 匹配会漏
    if (!a && PROTOCOL[src as ProviderType]) {
      const proto = PROTOCOL[src as ProviderType];
      const cands = readAll().filter(p => PROTOCOL[p.type] === proto);
      if (cands.length === 1) a = cands[0];
    }
    if (!a || !itemId) return null;
    const proto = PROTOCOL[a.type];
    if (proto === 'subsonic') return { url: subUrl(a, 'stream', { id: itemId, maxBitRate: '0', format: 'raw' }) };
    if (proto === 'emby' || proto === 'jellyfin') {
      // 无损容器 ExoPlayer 解不了（ape/wma/alac...）：直流必报 UnrecognizedInputFormatException，直接出转码流
      const c = song.container;
      if (c && !DIRECT_PLAY_OK.has(c)) return transcodeUrlFor(a, itemId);
      return { url: `${embyRoot(a)}/Audio/${itemId}/stream?static=true`, headers: embyHeaders(a) };
    }
    return null;
  },

  /** 转码流（直流失败/弱网回退）：Emby/JF 服务端转 mp3；Subsonic 限码率；WebDAV 无（返回 null） */
  transcodeFor(song: SongItem): { url: string; headers?: Record<string, string> } | null {
    const src = song.source;
    const mid = String(song.songmid ?? '');
    if (src === 'webdav') return null;
    const [pid, itemId] = mid.split(':');
    let a = providers.get(pid);
    if (!a && PROTOCOL[src as ProviderType]) {
      const proto = PROTOCOL[src as ProviderType];
      const cands = readAll().filter(p => PROTOCOL[p.type] === proto);
      if (cands.length === 1) a = cands[0];
    }
    if (!a || !itemId) return null;
    const proto = PROTOCOL[a.type];
    if (proto === 'subsonic') return { url: subUrl(a, 'stream', { id: itemId, maxBitRate: '320' }) };
    if (proto === 'emby' || proto === 'jellyfin') {
      // 服务端转码 mp3：外网/弱网下比无损直流可靠得多；PlaySessionId 唯一化防转码目录互删
      return transcodeUrlFor(a, itemId);
    }
    return null;
  },

  /** 播放回写（fire-and-forget）：Subsonic scrobble / Emby·JF PlayedItems，让服务器侧有播放统计 */
  async scrobble(a: ProviderAcct, itemId: string): Promise<void> {
    try {
      if (PROTOCOL[a.type] === 'subsonic') {
        await subCall(a, 'scrobble', { id: itemId, submission: 'true' });
      } else if (PROTOCOL[a.type] === 'emby' || PROTOCOL[a.type] === 'jellyfin') {
        await embyFetch(a, `/Users/${a.userId}/PlayedItems/${itemId}`, { method: 'POST' });
      }
    } catch { /* 统计失败不影响播放 */ }
  },

  /** Emby/JF 播放会话上报（vc78）：Sessions/Playing 三件套——PlayedItems 只标已播不进后台统计，
   * 服务器侧的播放次数/时长/活跃流需要会话上报才有 */
  async reportPlayback(a: ProviderAcct, itemId: string, ev: 'start' | 'progress' | 'stop', posMs: number, playSessionId: string): Promise<void> {
    try {
      const proto = PROTOCOL[a.type];
      if (proto !== 'emby' && proto !== 'jellyfin') return;
      const ticks = Math.max(0, Math.round(posMs * 10000)); // ms → ticks(100ns)
      const body = JSON.stringify({ itemId, playSessionId, positionTicks: ticks });
      if (ev === 'start') await embyFetch(a, '/Sessions/Playing', { method: 'POST', body });
      else if (ev === 'progress') await embyFetch(a, '/Sessions/Playing/Progress', { method: 'POST', body });
      else await embyFetch(a, '/Sessions/Playing/Stopped', { method: 'POST', body });
    } catch { /* 统计失败不影响播放 */ }
  },

  /** WebDAV 目录浏览：返回子目录 + 音频文件（音频文件已转 SongItem） */
  async webdavList(a: ProviderAcct, dir: string): Promise<{ dirs: { name: string; path: string }[]; songs: SongItem[] }> {
    const base = norm(a.base);
    const url = dir === '/' ? `${base}/` : `${base}${dir}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(url, {
        method: 'PROPFIND',
        headers: { Depth: '1', ...basicAuth(a), 'Content-Type': 'application/xml' },
        body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:displayname/></d:prop></d:propfind>',
        signal: ctrl.signal,
      });
      if (!r.ok && r.status !== 207) throw new Error('HTTP ' + r.status + '（检查地址是否为 WebDAV 端点）');
      const xml = await r.text();
      // 相对路径计算不依赖 URL 构造器（RN 的 URL 实现与 WHATWG 语义不一致，startsWith 前缀剥离会失效
      // → Alist 这类 href 含挂载前缀(/dav/..)的服务器会拼出 /dav/dav/.. 双前缀 404）
      const origin = (() => { const i = base.indexOf('://'); const s = i < 0 ? -1 : base.indexOf('/', i + 3); return s < 0 ? base : base.slice(0, s); })();
      const basePath = base.slice(origin.length).replace(/\/+$/, ''); // 如 '/dav'；base 在服务器根则为 ''
      const dirs: { name: string; path: string }[] = [];
      const songs: SongItem[] = [];
      const AUDIO = /\.(mp3|flac|m4a|aac|ogg|wav|ape|wma|opus)$/i;
      // href 可能被 URL 编码；逐个解码比较
      const hrefs: string[] = [];
      const reHref = /<(?:[\w-]+:)?href>([^<]+)<\/(?:[\w-]+:)?href>/gi;
      let mm: RegExpExecArray | null;
      while ((mm = reHref.exec(xml)) !== null) hrefs.push(mm[1]);
      for (const hrefRaw of hrefs) {
        // 服务器绝对路径或完整 URL → 统一成路径，再剥掉 base 挂载前缀
        let p = hrefRaw;
        const mAbs = p.match(/^[a-zA-Z][a-zA-Z0-9+.\-]*:\/\/[^/]*/);
        if (mAbs) p = p.slice(mAbs[0].length) || '/';
        // 前缀剥离统一在解码域比较：服务器 href 恒为百分号编码（/dav/%E7%BD%91..），
        // 而用户填的 base 可能是原始中文（/dav/网易云）——原文 startsWith 会失配 → 双前缀 404 / 认证头挂不上
        const basePathDec = safeDec(basePath);
        const pDec = safeDec(p);
        let rel = pDec.startsWith(basePathDec + '/') ? pDec.slice(basePathDec.length) : pDec;
        if (!rel.startsWith('/')) rel = '/' + rel;
        // 当前目录自身（rel === dir 或 dir 去尾斜杠）跳过
        const cur = dir === '/' ? '/' : dir.endsWith('/') ? dir : dir + '/';
        if (rel === cur || rel === cur.replace(/\/$/, '') || rel === '/') continue;
        if (p.endsWith('/')) {
          dirs.push({ name: rel.replace(/\/$/, '').split('/').pop() || rel, path: rel });
        } else if (AUDIO.test(rel)) {
          const absUrl = hrefRaw.startsWith('/') ? origin + hrefRaw : mAbs ? hrefRaw : base + '/' + hrefRaw;
          const file = rel.split('/').pop() || rel;
          const stem = file.replace(AUDIO, '');
          const dash = stem.split(' - ');
          songs.push({
            name: dash.length >= 2 ? dash.slice(1).join(' - ').trim() : stem,
            singer: dash.length >= 2 ? dash[0].trim() : (a.name || 'WebDAV'),
            source: 'webdav',
            songmid: absUrl,
            albumId: '', interval: '',
            albumName: a.name,
          });
        }
      }
      return { dirs, songs };
    } finally { clearTimeout(t); }
  },

  /** WebDAV 文件操作（云备份用）：PUT 上传 / GET 下载 */
  async webdavPut(a: { base: string; user: string; pass: string }, path: string, content: string): Promise<void> {
    const r = await fetch(norm(a.base) + path, { method: 'PUT', headers: basicAuth(a), body: content });
    if (!r.ok && r.status !== 201 && r.status !== 204) throw new Error('上传失败 HTTP ' + r.status);
  },
  async webdavGet(a: { base: string; user: string; pass: string }, path: string): Promise<string> {
    const r = await fetch(norm(a.base) + path, { headers: basicAuth(a) });
    if (!r.ok) throw new Error('下载失败 HTTP ' + r.status);
    return r.text();
  },
  async webdavTest(a: { base: string; user: string; pass: string }): Promise<void> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(norm(a.base) + '/', { method: 'PROPFIND', headers: { Depth: '0', ...basicAuth(a) }, signal: ctrl.signal });
      if (r.status === 401) throw new Error('HTTP 401：账号或密码错误（服务器端凭据可能已变更，请更新后重试）');
      if (!r.ok && r.status !== 207) throw new Error('HTTP ' + r.status + '（不是有效 WebDAV 端点）');
    } finally { clearTimeout(t); }
  },
};
