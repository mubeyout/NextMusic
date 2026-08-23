// 第三方媒体库接入：Subsonic(Navidrome/道理鱼/Subsonic) · Emby · Jellyfin · WebDAV
// 账号持久化在 MMKV；对外统一输出 SongItem（source = provider 类型，songmid = "pid:itemId"）
// 播放/下载统一走 streamUrlFor() + authHeadersFor()
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from './server';

const kv = createMMKV({ id: 'nextmusic-providers' });

export type ProviderType = 'subsonic' | 'navidrome' | 'daoliyu' | 'emby' | 'jellyfin' | 'webdav';

// 协议映射：navidrome / 道理鱼 走 Subsonic 协议
export const PROTOCOL: Record<ProviderType, 'subsonic' | 'emby' | 'jellyfin' | 'webdav'> = {
  subsonic: 'subsonic', navidrome: 'subsonic', daoliyu: 'subsonic',
  emby: 'emby', jellyfin: 'jellyfin', webdav: 'webdav',
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
}

export const PROVIDER_META: Record<ProviderType, { label: string; hint: string; placeholder: string }> = {
  subsonic: { label: 'Subsonic', hint: 'Subsonic 服务器（原生）', placeholder: 'http://192.168.1.10:4040' },
  navidrome: { label: 'Navidrome', hint: 'Navidrome 音乐服务器（Subsonic 兼容）', placeholder: 'http://192.168.1.10:4533' },
  daoliyu: { label: '道理鱼音乐', hint: '道理鱼（Subsonic 兼容，NAS 自建音乐库）', placeholder: 'http://192.168.1.10:4533' },
  emby: { label: 'Emby', hint: 'Emby 媒体服务器（音乐库）', placeholder: 'http://192.168.1.10:8096' },
  jellyfin: { label: 'Jellyfin', hint: 'Jellyfin 媒体服务器（音乐库）', placeholder: 'http://192.168.1.10:8096' },
  webdav: { label: 'WebDAV', hint: 'NAS / 飞牛 fnOS / Alist 等 WebDAV 共享目录，直接浏览音频文件', placeholder: 'http://192.168.1.10:5244/dav' },
};

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
export const providerApi = {
  /** 连接测试 + 登录（成功返回更新后的账号，含 token/userId） */
  async connect(a: ProviderAcct): Promise<ProviderAcct> {
    const base = norm(a.base);
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

  /** 专辑/歌单列表 */
  async albums(a: ProviderAcct): Promise<{ id: string; name: string; artist?: string; songCount?: number; cover?: string }[]> {
    if (PROTOCOL[a.type] === 'subsonic') {
      const d = await subCall<{ albumList2?: { album?: Record<string, unknown>[] } }>(a, 'getAlbumList2', { type: 'alphabeticalByName', size: '200' });
      return (d.albumList2?.album || []).map(al => ({
        id: String(al.id), name: String(al.name || ''),
        artist: al.artist ? String(al.artist) : undefined,
        songCount: al.songCount ? Number(al.songCount) : undefined,
        cover: al.coverArt ? subUrl(a, 'getCoverArt', { id: String(al.coverArt), size: '300' }) : undefined,
      }));
    }
    if (PROTOCOL[a.type] === 'emby' || PROTOCOL[a.type] === 'jellyfin') {
      const d = (await embyFetch(a, `/Users/${a.userId}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&SortBy=SortName&Limit=300&Fields=PrimaryImageAspectRatio`)) as { Items?: Record<string, unknown>[] };
      return (d.Items || []).map(it => ({
        id: String(it.Id), name: String(it.Name || ''),
        artist: it.AlbumArtist ? String(it.AlbumArtist) : (it.Artists ? String((it.Artists as string[])[0] || '') : undefined),
        songCount: it.ChildCount ? Number(it.ChildCount) : undefined,
        // emby 支持 api_key query；jellyfin 图片端点同样兼容 api_key（老版本），失败则无封面
        cover: `${embyRoot(a)}/Items/${it.Id}/Images/Primary?maxWidth=300${a.token ? `&api_key=${a.token}` : ''}`,
      }));
    }
    return [];
  },

  /** 专辑内歌曲 */
  async albumSongs(a: ProviderAcct, albumId: string): Promise<SongItem[]> {
    const pid = a.id;
    if (PROTOCOL[a.type] === 'subsonic') {
      const d = await subCall<{ album?: { song?: Record<string, unknown>[] } }>(a, 'getAlbum', { id: albumId });
      return (d.album?.song || []).map(s => {
        const id = String(s.id);
        return {
          name: String(s.title || s.album || '未知曲目'),
          singer: String(s.artist || ''),
          source: 'subsonic',
          songmid: `${pid}:${id}`,
          albumId: String(s.albumId || albumId),
          albumName: s.album ? String(s.album) : undefined,
          interval: fmtSec(Number(s.duration)),
          img: s.coverArt ? subUrl(a, 'getCoverArt', { id: String(s.coverArt), size: '300' }) : undefined,
        } as SongItem;
      });
    }
    if (PROTOCOL[a.type] === 'emby' || PROTOCOL[a.type] === 'jellyfin') {
      const d = (await embyFetch(a, `/Users/${a.userId}/Items?ParentId=${albumId}&IncludeItemTypes=Audio&SortBy=ParentIndexNumber,IndexNumber,SortName&Limit=500`)) as { Items?: Record<string, unknown>[] };
      return (d.Items || []).map(it => ({
        name: String(it.Name || '未知曲目'),
        singer: it.Artists ? String((it.Artists as string[]).join(', ')) : (it.AlbumArtist ? String(it.AlbumArtist) : ''),
        source: a.type,
        songmid: `${pid}:${it.Id}`,
        albumId: albumId,
        albumName: it.Album ? String(it.Album) : undefined,
        interval: fmtSec(Number(it.RunTimeTicks) / 10000000),
        img: undefined,
      })) as SongItem[];
    }
    return [];
  },

  /** 播放/下载地址 + 请求头 */
  streamFor(song: SongItem): { url: string; headers?: Record<string, string> } | null {
    const src = song.source;
    if (src === 'webdav') {
      const a = providers.all().find(p => p.type === 'webdav' && song.songmid.startsWith(norm(p.base)));
      return { url: song.songmid, headers: a ? basicAuth(a) : undefined };
    }
    const [pid, itemId] = song.songmid.split(':');
    const a = providers.get(pid);
    if (!a || !itemId) return null;
    const proto = PROTOCOL[a.type];
    if (proto === 'subsonic') return { url: subUrl(a, 'stream', { id: itemId, maxBitRate: '0', format: 'raw' }) };
    if (proto === 'emby' || proto === 'jellyfin') {
      return { url: `${embyRoot(a)}/Audio/${itemId}/stream?static=true`, headers: embyHeaders(a) };
    }
    return null;
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
      const selfHref = encodeURI(dir === '/' ? '/' : dir.endsWith('/') ? dir : dir + '/');
      const dirs: { name: string; path: string }[] = [];
      const songs: SongItem[] = [];
      const AUDIO = /\.(mp3|flac|m4a|aac|ogg|wav|ape|wma|opus)$/i;
      // href 可能被 URL 编码；逐个解码比较
      const hrefs: string[] = [];
      const reHref = /<(?:[\w-]+:)?href>([^<]+)<\/(?:[\w-]+:)?href>/gi;
      let mm: RegExpExecArray | null;
      while ((mm = reHref.exec(xml)) !== null) hrefs.push(mm[1]);
      for (const hrefRaw of hrefs) {
        const href = decodeURIComponent(hrefRaw);
        // 去掉 base 的路径前缀，得到相对路径
        let rel = href;
        try {
          const u = new URL(href, base + '/');
          const bp = new URL(base + '/');
          rel = decodeURIComponent(u.pathname.startsWith(bp.pathname) ? u.pathname.slice(bp.pathname.length - 1) : u.pathname);
        } catch { /* keep */ }
        if (rel === '/' || rel === selfHref || rel === selfHref.replace(/^\//, '')) continue;
        if (hrefRaw.endsWith('/')) {
          dirs.push({ name: rel.replace(/\/$/, '').split('/').pop() || rel, path: rel });
        } else if (AUDIO.test(rel)) {
          const absUrl = (() => { try { return new URL(href, base + '/').toString(); } catch { return base + href; } })();
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
      if (!r.ok && r.status !== 207) throw new Error('HTTP ' + r.status + '（不是有效 WebDAV 端点）');
    } finally { clearTimeout(t); }
  },
};
