// 第三方媒体库引擎 v2（老板 2026-09-18 指令：对齐 Amcfy 支持的平台）
// Plex · Audiobookshelf · Synology AudioStation · mStream · Songloft
// 五引擎统一输出 PvAlbum/PvArtist/PvPlaylist/SongItem；providers.ts 的 providerApi 按类型委托到这里
// 鉴权与流地址全部走 query token（web 端 <audio>/<img> 无法带 header）：
//   Plex ?X-Plex-Token= · ABS ?token= · AudioStation ?_sid= · mStream ?token= · Songloft ?access_token=
// 协议依据：Plex API v2 · audiobookshelf.org · Synology Web API · mStream v5 openapi · songloft-org/songloft routers.go
import type { ProviderAcct, PvAlbum, PvArtist, PvPlaylist } from './providers';
import type { SongItem } from './server';

// ---------- 通用 ----------
function norm(base: string): string { return base.trim().replace(/\/+$/, ''); }
function enc(s: string): string { return encodeURIComponent(s); }
function dec(s: string): string { try { return decodeURIComponent(s); } catch { return s; } }
function pad2(n: number) { return n < 10 ? '0' + n : '' + n; }
function fmtSec(sec?: number): string {
  if (!sec || !isFinite(sec) || sec <= 0) return '';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${pad2(s)}`;
}
async function jfetch(url: string, init?: RequestInit & { timeout?: number }): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeout ?? 10000);
  try {
    const r = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers as Record<string, string> | undefined) },
      signal: ctrl.signal,
    });
    const txt = await r.text();
    let d: any = null;
    try { d = txt ? JSON.parse(txt) : null; } catch { d = txt; }
    if (!r.ok) throw new Error((d && (d.error || d.message || d.errorMsg)) ? `${d.error || d.message || d.errorMsg}` : `HTTP ${r.status}`);
    return d;
  } finally { clearTimeout(t); }
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export type StreamResult = { url: string; headers?: Record<string, string> } | null;

// ---------- Plex ----------
const PLEX_PRODUCT = 'NextMusic';
const PLEX_TTL: Record<string, string> = { 'X-Plex-Product': PLEX_PRODUCT, 'X-Plex-Client-Identifier': '', Accept: 'application/json' };
const plexHeaders = (clientId: string): Record<string, string> => ({ ...PLEX_TTL, 'X-Plex-Client-Identifier': clientId });

/** PIN 授权开始：返回轮询 id + 用户要在浏览器打开的 URL（web 端 window.open / RN 端 Linking） */
export async function plexBeginPin(clientId: string): Promise<{ pinId: string; url: string }> {
  const d = await jfetch('https://plex.tv/api/v2/pins?strong=true', { method: 'POST', headers: plexHeaders(clientId), timeout: 12000 });
  const url = `https://app.plex.tv/auth#?clientID=${enc(clientId)}&code=${enc(d.code)}&context%5Bdevice%5D%5Bproduct%5D=${enc(PLEX_PRODUCT)}`;
  return { pinId: String(d.id), url };
}
/** PIN 轮询：未确认返回 null，确认返回 authToken */
export async function plexPollPin(clientId: string, pinId: string): Promise<string | null> {
  const d = await jfetch(`https://plex.tv/api/v2/pins/${pinId}`, { headers: plexHeaders(clientId), timeout: 8000 });
  return d && d.authToken ? String(d.authToken) : null;
}
/** 授权完成 → 选服务器（自有+在线优先，本地连接优先）+ 音乐库分区 → 半成品账号字段 */
export async function plexFinish(authToken: string): Promise<{ base: string; token: string; root: string; name: string }> {
  const list = await jfetch('https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=1', { headers: { 'X-Plex-Token': authToken, Accept: 'application/json' }, timeout: 15000 });
  const servers = (Array.isArray(list) ? list : []).filter((r: any) => (r.provides || []).includes('server') && r.accessToken && (r.owned ?? true));
  if (!servers.length) throw new Error('Plex 账号下没有可用的媒体服务器');
  const trySection = async (base: string, token: string): Promise<string | null> => {
    try {
      const d = await jfetch(`${base}/library/sections?X-Plex-Token=${enc(token)}`, { headers: { Accept: 'application/json' }, timeout: 6000 });
      const dirs: any[] = (d.MediaContainer?.Directory) || [];
      const music = dirs.find(x => String(x.type) === 'artist');
      return music ? String(music.key) : null;
    } catch { return null; }
  };
  let lastErr = '服务器都无法连接';
  for (const s of servers.sort((a: any, b: any) => (b.presence === true ? 1 : 0) - (a.presence === true ? 1 : 0))) {
    const conns: any[] = (s.connections || []).sort((a: any, b: any) => (b.local === true ? 1 : 0) - (a.local === true ? 1 : 0));
    for (const c of conns) {
      const base = norm(String(c.uri));
      const key = await trySection(base, String(s.accessToken));
      if (key) return { base, token: String(s.accessToken), root: key, name: String(s.name) };
      lastErr = `${s.name} 不可达`;
    }
  }
  throw new Error(lastErr);
}

/** 手动模式：已知服务器地址+Token → 验证并远音乐库分区 */
export async function plexManual(base: string, token: string): Promise<{ base: string; token: string; root: string; name: string }> {
  const b = norm(base);
  const d = await jfetch(`${b}/library/sections?X-Plex-Token=${enc(token)}`, { headers: { Accept: 'application/json' }, timeout: 8000 });
  const dirs: any[] = d.MediaContainer?.Directory || [];
  const music = dirs.find(x => String(x.type) === 'artist');
  if (!music) throw new Error('Token 有效但服务器上没有音乐库（type=artist 的 section）');
  const name = String(d.MediaContainer?.friendlyName || 'Plex');
  return { base: b, token, root: String(music.key), name };
}

 function plexSong(pid: string, m: any): SongItem {
  const part = m.Media?.[0]?.Part?.[0];
  return {
    name: String(m.title || '未知曲目'),
    singer: String(m.grandparentTitle || m.originalTitle || ''),
    source: 'plex',
    songmid: `${pid}:${enc(String(part?.key || m.ratingKey))}`, // 存 part key：streamFor 免二次请求
    albumId: String(m.parentRatingKey || ''),
    albumName: m.parentTitle ? String(m.parentTitle) : undefined,
    interval: fmtSec(Number(m.duration) / 1000),
    container: String(part?.file || '').split('.').pop()?.toLowerCase(),
    pk: String(m.ratingKey), // scrobble 用
  } as SongItem & { pk?: string };
}
const plex = {
  async albums(a: ProviderAcct): Promise<PvAlbum[]> {
    const d = await jfetch(`${a.base}${a.root}/all?type=9&X-Plex-Token=${enc(a.token || '')}`, { headers: { Accept: 'application/json' } });
    return ((d.MediaContainer?.Metadata) || []).map((m: any) => ({
      id: String(m.ratingKey), name: String(m.title || ''),
      artist: m.parentTitle ? String(m.parentTitle) : undefined,
      songCount: m.leafCount ? Number(m.leafCount) : undefined,
      year: m.year ? Number(m.year) : undefined,
      cover: m.thumb ? `${a.base}${m.thumb}?X-Plex-Token=${enc(a.token || '')}` : undefined,
    }));
  },
  async artists(a: ProviderAcct): Promise<PvArtist[]> {
    const d = await jfetch(`${a.base}${a.root}/all?X-Plex-Token=${enc(a.token || '')}`, { headers: { Accept: 'application/json' } });
    return ((d.MediaContainer?.Metadata) || []).map((m: any) => ({
      id: String(m.ratingKey), name: String(m.title || ''),
      cover: m.thumb ? `${a.base}${m.thumb}?X-Plex-Token=${enc(a.token || '')}` : undefined,
    }));
  },
  async artistAlbums(a: ProviderAcct, artistId: string): Promise<PvAlbum[]> {
    const d = await jfetch(`${a.base}/library/metadata/${artistId}/children?X-Plex-Token=${enc(a.token || '')}`, { headers: { Accept: 'application/json' } });
    return ((d.MediaContainer?.Metadata) || []).filter((m: any) => m.type === 'album').map((m: any) => ({
      id: String(m.ratingKey), name: String(m.title || ''), songCount: m.leafCount ? Number(m.leafCount) : undefined,
      year: m.year ? Number(m.year) : undefined,
      cover: m.thumb ? `${a.base}${m.thumb}?X-Plex-Token=${enc(a.token || '')}` : undefined,
    }));
  },
  async randomSongs(a: ProviderAcct, size = 100): Promise<SongItem[]> {
    const d = await jfetch(`${a.base}${a.root}/all?type=10&sort=addedAt:desc&limit=${Math.min(size, 200)}&X-Plex-Token=${enc(a.token || '')}`, { headers: { Accept: 'application/json' } });
    return shuffle(((d.MediaContainer?.Metadata) || []).map((m: any) => plexSong(a.id, m)));
  },
  async playlists(a: ProviderAcct): Promise<PvPlaylist[]> {
    const d = await jfetch(`${a.base}/playlists?X-Plex-Token=${enc(a.token || '')}`, { headers: { Accept: 'application/json' } });
    return ((d.MediaContainer?.Metadata) || []).filter((m: any) => m.playlistType !== 'video').map((m: any) => ({
      id: String(m.ratingKey), name: String(m.title || ''),
      songCount: m.leafCount ? Number(m.leafCount) : undefined,
      cover: m.composite ? `${a.base}${m.composite}?X-Plex-Token=${enc(a.token || '')}` : undefined,
    }));
  },
  async playlistSongs(a: ProviderAcct, playlistId: string): Promise<SongItem[]> {
    const d = await jfetch(`${a.base}/playlists/${playlistId}/items?X-Plex-Token=${enc(a.token || '')}`, { headers: { Accept: 'application/json' } });
    return ((d.MediaContainer?.Metadata) || []).filter((m: any) => m.type === 'track').map((m: any) => plexSong(a.id, m));
  },
  async albumSongs(a: ProviderAcct, albumId: string): Promise<SongItem[]> {
    const d = await jfetch(`${a.base}/library/metadata/${albumId}/children?X-Plex-Token=${enc(a.token || '')}`, { headers: { Accept: 'application/json' } });
    return ((d.MediaContainer?.Metadata) || []).filter((m: any) => m.type === 'track').map((m: any) => plexSong(a.id, m));
  },
  streamOf(a: ProviderAcct, itemId: string): StreamResult {
    // itemId = percent-encoded part key；PMS 对 part.key GET 自动直放/按能力转码
    return { url: `${a.base}${dec(itemId)}?X-Plex-Token=${enc(a.token || '')}` };
  },
  async scrobble(a: ProviderAcct, ratingKey: string): Promise<void> {
    try { await jfetch(`${a.base}/:/scrobble?identifier=com.plexapp.plugins.library&key=${enc(ratingKey)}`, { method: 'GET', headers: { 'X-Plex-Token': a.token || '' } }); } catch { /* 统计尽力而为 */ }
  },
};

// ---------- Audiobookshelf（有声书；专辑=书，歌曲=整书或分轨） ----------
const absCover = (a: ProviderAcct, itemId: string) => `${a.base}/api/items/${itemId}/cover?token=${enc(a.token || '')}`;
const abs = {
  async connect(a: ProviderAcct): Promise<ProviderAcct> {
    const base = norm(a.base);
    const d = await jfetch(`${base}/api/auth/login`, { method: 'POST', body: JSON.stringify({ username: a.user, password: a.pass }) });
    const user = d.user || {};
    if (!user.token) throw new Error('登录失败：账号或密码错误');
    const libs = await jfetch(`${base}/api/libraries`, { headers: { Authorization: `Bearer ${user.token}` } });
    const book = (libs.libraries || []).find((l: any) => l.mediaType === 'book') || (libs.libraries || [])[0];
    if (!book) throw new Error('服务器上没有媒体库');
    return { ...a, base, token: String(user.token), userId: String(user.id || ''), root: String(book.id), name: a.name.trim() || String(book.name || 'Audiobookshelf') };
  },
  async albums(a: ProviderAcct): Promise<PvAlbum[]> {
    const d = await jfetch(`${a.base}/api/libraries/${a.root}/items?limit=300&sort=media.metadata.title`, { headers: { Authorization: `Bearer ${a.token}` } });
    return (d.results || []).map((it: any) => ({
      id: String(it.id), name: String(it.media?.metadata?.title || ''),
      artist: it.media?.metadata?.authorName ? String(it.media.metadata.authorName) : undefined,
      songCount: it.media?.numAudioTracks ? Number(it.media.numAudioTracks) : undefined,
      year: it.media?.metadata?.publishedYear ? Number(String(it.media.metadata.publishedYear).slice(0, 4)) : undefined,
      cover: absCover(a, String(it.id)),
    }));
  },
  async artists(a: ProviderAcct): Promise<PvArtist[]> {
    const d = await jfetch(`${a.base}/api/libraries/${a.root}/authors?limit=300`, { headers: { Authorization: `Bearer ${a.token}` } });
    return (d.authors || []).map((x: any) => ({
      id: String(x.id), name: String(x.name || ''),
      cover: x.hasImage ? `${a.base}/api/libraries/${a.root}/authors/${x.id}/image?token=${enc(a.token || '')}` : undefined,
    }));
  },
  async artistAlbums(a: ProviderAcct, authorId: string): Promise<PvAlbum[]> {
    const d = await jfetch(`${a.base}/api/libraries/${a.root}/authors/${authorId}?include=books`, { headers: { Authorization: `Bearer ${a.token}` } });
    return (d.books || []).map((b: any) => ({
      id: String(b.id), name: String(b.media?.metadata?.title || b.title || ''),
      songCount: b.media?.numAudioTracks ? Number(b.media.numAudioTracks) : undefined,
      cover: absCover(a, String(b.id)),
    }));
  },
  async randomSongs(a: ProviderAcct, size = 60): Promise<SongItem[]> {
    const d = await jfetch(`${a.base}/api/libraries/${a.root}/items?limit=${size}&sort=addedAt&desc=1`, { headers: { Authorization: `Bearer ${a.token}` } });
    return shuffle((d.results || []).map((it: any) => {
      const md = it.media?.metadata || {};
      return {
        name: String(md.title || '未知书目'), singer: String(md.authorName || ''),
        source: 'audiobookshelf', songmid: `${a.id}:${it.id}#0`,
        albumId: String(it.id), albumName: String(md.title || ''),
        interval: it.media?.duration ? fmtSec(Number(it.media.duration)) : '',
        img: absCover(a, String(it.id)),
      } as SongItem;
    }));
  },
  async playlists(a: ProviderAcct): Promise<PvPlaylist[]> {
    const d = await jfetch(`${a.base}/api/playlists`, { headers: { Authorization: `Bearer ${a.token}` } });
    return (d.playlists || []).map((p: any) => ({ id: String(p.id), name: String(p.name || ''), songCount: p.items ? Number(p.items) : undefined }));
  },
  async playlistSongs(a: ProviderAcct, playlistId: string): Promise<SongItem[]> {
    const d = await jfetch(`${a.base}/api/playlists/${playlistId}/items?limit=500`, { headers: { Authorization: `Bearer ${a.token}` } });
    return (d.items || []).map((x: any) => {
      const li = x.libraryItem || x;
      const md = li.media?.metadata || {};
      return {
        name: String(md.title || ''), singer: String(md.authorName || ''),
        source: 'audiobookshelf', songmid: `${a.id}:${li.id}#0`,
        albumId: String(li.id), albumName: String(md.title || ''),
        interval: li.media?.duration ? fmtSec(Number(li.media.duration)) : '',
        img: absCover(a, String(li.id)),
      } as SongItem;
    });
  },
  async albumSongs(a: ProviderAcct, itemId: string): Promise<SongItem[]> {
    const d = await jfetch(`${a.base}/api/items/${itemId}/play`, { method: 'POST', headers: { Authorization: `Bearer ${a.token}` }, body: '{}' });
    return (d.audioTracks || []).map((t: any, i: number) => ({
      name: `第 ${i + 1} 轨`, singer: '',
      source: 'audiobookshelf', songmid: `${a.id}:${itemId}#${t.index ?? i}`,
      albumId: itemId, albumName: '',
      interval: t.duration ? fmtSec(Number(t.duration)) : '',
      img: absCover(a, itemId),
    }) as SongItem);
  },
  streamOf(a: ProviderAcct, itemId: string): StreamResult {
    // itemId 形如 "abc123#2"（书 id + 轨号）；/s/ 路由吃 token query
    const [id, idx] = itemId.split('#');
    return { url: `${a.base}/s/item/${id}/${idx || 0}?token=${enc(a.token || '')}` };
  },
  async scrobble(): Promise<void> { /* ABS 播放进度走 /api/me/playback-sync，v1 不接 */ },
};

// ---------- Synology AudioStation（DSM 7.x，SYNO.API.Info 发现 + sid 会话） ----------
type SynoPaths = { auth: string; song: string; album: string; artist: string; playlist: string; cover: string; stream: string };
const SYNO_DEFAULT: SynoPaths = {
  auth: '/webapi/auth.cgi', song: '/webapi/AudioStation/song.cgi', album: '/webapi/AudioStation/album.cgi',
  artist: '/webapi/AudioStation/artist.cgi', playlist: '/webapi/AudioStation/playlist.cgi',
  cover: '/webapi/AudioStation/cover.cgi', stream: '/webapi/AudioStation/stream.cgi',
};
function synoPaths(a: ProviderAcct): SynoPaths {
  try { return { ...SYNO_DEFAULT, ...JSON.parse(a.root || '{}') }; } catch { return SYNO_DEFAULT; }
}
function synoUrl(a: ProviderAcct, path: string, api: string, extra: Record<string, string>): string {
  const p = extra ? Object.entries(extra).map(([k, v]) => `&${k}=${enc(v)}`).join('') : '';
  return `${a.base}${path}?api=${api}${p}&_sid=${enc(a.token || '')}`;
}
function synoSong(pid: string, s: any): SongItem {
  const tag = s.additional?.song_tag || {};
  const audio = s.additional?.song_audio || {};
  return {
    name: String(s.title || tag.title || '未知曲目'),
    singer: String(tag.artists?.[0] || s.artist || ''),
    source: 'audiostation',
    songmid: `${pid}:${s.id}`,
    albumId: '', albumName: String(tag.album || ''),
    interval: fmtSec(Number(audio.duration)),
    container: audio?.codec ? String(audio.codec).toLowerCase() : undefined,
  } as SongItem;
}
const syno = {
  async connect(a: ProviderAcct): Promise<ProviderAcct> {
    const base = norm(a.base);
    // 1) API Info 发现（失败退回 /webapi 默认路径）
    let paths: SynoPaths = { ...SYNO_DEFAULT };
    try {
      const info = await jfetch(`${base}/webapi/query.cgi?api=SYNO.API.Info&version=1&method=query&query=${enc('SYNO.API.Auth,SYNO.AudioStation.Song,SYNO.AudioStation.Album,SYNO.AudioStation.Artist,SYNO.AudioStation.Playlist,SYNO.AudioStation.Cover,SYNO.AudioStation.Stream')}`);
      const d = info.data || {};
      const pick = (api: string, fb: string) => d[api]?.path ? String(d[api].path) : fb;
      paths = {
        auth: pick('SYNO.API.Auth', SYNO_DEFAULT.auth),
        song: pick('SYNO.AudioStation.Song', SYNO_DEFAULT.song),
        album: pick('SYNO.AudioStation.Album', SYNO_DEFAULT.album),
        artist: pick('SYNO.AudioStation.Artist', SYNO_DEFAULT.artist),
        playlist: pick('SYNO.AudioStation.Playlist', SYNO_DEFAULT.playlist),
        cover: pick('SYNO.AudioStation.Cover', SYNO_DEFAULT.cover),
        stream: pick('SYNO.AudioStation.Stream', SYNO_DEFAULT.stream),
      };
    } catch { /* 老 DSM 或路径定制 → 默认 */ }
    // 2) 登录换 sid
    const login = await jfetch(`${base}${paths.auth}?api=SYNO.API.Auth&version=3&method=login&account=${enc(a.user)}&passwd=${enc(a.pass)}&session=AudioStation&format=sid`);
    if (!login.success || !login.data?.sid) {
      const code = login.error?.code ? `（code ${login.error.code}）` : '';
      throw new Error(`登录失败${code}：检查账号密码，且账号需有 Audio Station 权限`);
    }
    // 3) 试拉 1 首歌验证 AudioStation 可用（未安装会在这里暴露）
    const sid = String(login.data.sid);
    const pathsJson = JSON.stringify(paths);
    try {
      const probe = await jfetch(synoUrl({ ...a, base, token: sid, root: pathsJson }, paths.song, 'SYNO.AudioStation.Song', { version: '1', method: 'list', library: 'all', limit: '1', offset: '0' }));
      if (probe.success === false) throw new Error(probe.error?.errors ? `AudioStation 不可用（code ${probe.error.errors[0]?.code ?? ''}）` : 'AudioStation 不可用');
    } catch (e) { throw e as Error; }
    return { ...a, base, token: sid, root: pathsJson, name: a.name.trim() || 'Synology Audio Station' };
  },
  async albums(a: ProviderAcct): Promise<PvAlbum[]> {
    const p = synoPaths(a);
    const d = await jfetch(synoUrl(a, p.album, 'SYNO.AudioStation.Album', { version: '3', method: 'list', library: 'all', limit: '500', offset: '0', sort_by: 'name', sort_direction: 'ASC' }));
    return (d.data?.albums || []).map((al: any) => ({
      id: `${enc(String(al.name))}|${enc(String(al.album_artist || al.artist || ''))}`,
      name: String(al.name || ''),
      artist: al.album_artist || al.artist ? String(al.album_artist || al.artist) : undefined,
      year: al.year ? Number(al.year) : undefined,
      cover: synoUrl(a, p.cover, 'SYNO.AudioStation.Cover', { version: '3', method: 'getcover', library: 'all', view: 'detail', album_name: String(al.name), artist_name: String(al.album_artist || al.artist || '') }),
    }));
  },
  async artists(a: ProviderAcct): Promise<PvArtist[]> {
    const p = synoPaths(a);
    const d = await jfetch(synoUrl(a, p.artist, 'SYNO.AudioStation.Artist', { version: '5', method: 'list', library: 'all', limit: '500', offset: '0', additional: 'avg_rating', sort_by: 'name', sort_direction: 'ASC' }));
    return (d.data?.artists || []).map((ar: any) => ({ id: enc(String(ar.name)), name: String(ar.name || ''), albumCount: ar.additional?.album_count ? Number(ar.additional.album_count) : undefined }));
  },
  async artistAlbums(a: ProviderAcct, artistEnc: string): Promise<PvAlbum[]> {
    const artist = dec(artistEnc);
    const p = synoPaths(a);
    const d = await jfetch(synoUrl(a, p.album, 'SYNO.AudioStation.Album', { version: '3', method: 'list', library: 'all', limit: '500', offset: '0', artist: artist, sort_by: 'name', sort_direction: 'ASC' }));
    return (d.data?.albums || []).map((al: any) => ({
      id: `${enc(String(al.name))}|${enc(String(al.album_artist || al.artist || ''))}`,
      name: String(al.name || ''), artist: artist,
      cover: synoUrl(a, p.cover, 'SYNO.AudioStation.Cover', { version: '3', method: 'getcover', library: 'all', view: 'detail', album_name: String(al.name), artist_name: String(al.album_artist || al.artist || '') }),
    }));
  },
  async randomSongs(a: ProviderAcct, size = 100): Promise<SongItem[]> {
    const p = synoPaths(a);
    const d = await jfetch(synoUrl(a, p.song, 'SYNO.AudioStation.Song', { version: '3', method: 'list', library: 'all', limit: String(Math.min(size, 500)), offset: '0', sort_by: 'random', additional: 'song_tag,song_audio' }));
    return (d.data?.songs || []).map((s: any) => synoSong(a.id, s));
  },
  async playlists(a: ProviderAcct): Promise<PvPlaylist[]> {
    const p = synoPaths(a);
    const d = await jfetch(synoUrl(a, p.playlist, 'SYNO.AudioStation.Playlist', { version: '3', method: 'list', library: 'all', limit: '200', offset: '0', sort_by: 'title', sort_direction: 'ASC' }));
    return (d.data?.playlists || []).filter((pl: any) => !pl.type || String(pl.type) !== 'radio').map((pl: any) => ({
      id: String(pl.id), name: String(pl.name || ''),
      songCount: pl.additional?.songs?.total ? Number(pl.additional.songs.total) : undefined,
    }));
  },
  async playlistSongs(a: ProviderAcct, playlistId: string): Promise<SongItem[]> {
    const p = synoPaths(a);
    const d = await jfetch(synoUrl(a, p.playlist, 'SYNO.AudioStation.Playlist', { version: '3', method: 'list', library: 'all', playlist_method: 'list_songs', playlist_id: playlistId, limit: '500', offset: '0', additional: 'song_tag,song_audio' }));
    return (d.data?.songs || []).map((s: any) => synoSong(a.id, s));
  },
  async albumSongs(a: ProviderAcct, albumEncPair: string): Promise<SongItem[]> {
    const [albumE, artistE] = albumEncPair.split('|');
    const p = synoPaths(a);
    const extra: Record<string, string> = { version: '3', method: 'list', library: 'all', limit: '500', offset: '0', additional: 'song_tag,song_audio', sort_by: 'track', sort_direction: 'ASC', album: dec(albumE) };
    if (artistE) extra.artist = dec(artistE);
    const d = await jfetch(synoUrl(a, p.song, 'SYNO.AudioStation.Song', extra));
    return (d.data?.songs || []).map((s: any) => synoSong(a.id, s));
  },
  streamOf(a: ProviderAcct, itemId: string): StreamResult {
    const p = synoPaths(a);
    // 0.mp3 后缀让 DSM 直出音频流；id 即 song.cgi 返回的歌曲 id
    return { url: `${a.base}${p.stream}/0.mp3?api=SYNO.AudioStation.Stream&version=2&method=stream&id=${enc(itemId)}&_sid=${enc(a.token || '')}` };
  },
  async scrobble(): Promise<void> { /* AudioStation 无 scrobble API */ },
};

// ---------- mStream v5（JWT + vpath 库） ----------
function msSong(pid: string, base: string, token: string, m: any): SongItem {
  // Metadata = { filepath, metadata: MetadataLite }
  const md = m.metadata || {};
  const art = md['album-art'] || '';
  return {
    name: String(md.title || m.filepath?.split('/').pop() || '未知曲目'),
    singer: String(md.artist || ''),
    source: 'mstream',
    songmid: `${pid}:${enc(String(m.filepath))}`,
    albumId: md.album ? enc(String(md.album)) : '',
    albumName: md.album ? String(md.album) : undefined,
    interval: fmtSec(Number(md.duration)),
    img: art ? `${base}/album-art/${art.split('/').map(enc).join('/')}?token=${enc(token)}` : undefined,
  } as SongItem;
}
const ms = {
  async connect(a: ProviderAcct): Promise<ProviderAcct> {
    const base = norm(a.base);
    let token = '', vpaths: string[] = [];
    try {
      const d = await jfetch(`${base}/api/v1/auth/login`, { method: 'POST', body: JSON.stringify({ username: a.user, password: a.pass }) });
      token = String(d.token || ''); vpaths = d.vpaths || [];
    } catch (e) {
      // 无用户公开模式：所有请求免鉴权，login 可能 401 → 探 db 接口确认可用
      const pub = await jfetch(`${base}/api/v1/db/albums`, { method: 'POST', body: '{}' });
      if (!pub.albums) throw e;
    }
    if (!vpaths.length) { try { const s = await jfetch(`${base}/api/v1/db/status`, { headers: token ? { 'x-access-token': token } : {} }); vpaths = Object.keys(s.vpaths || {}); } catch { /* 旧版无 status.vpaths */ } }
    return { ...a, base, token, root: vpaths.join('|'), name: a.name.trim() || 'mStream' };
  },
  async albums(a: ProviderAcct): Promise<PvAlbum[]> {
    const d = await jfetch(`${a.base}/api/v1/db/albums`, { method: 'POST', headers: { 'x-access-token': a.token || '' }, body: JSON.stringify({ limit: 500, offset: 0, sort: 'name' }) });
    return (d.albums || []).map((al: any) => ({
      id: `${enc(String(al.name))}|${enc(String(al.album_artist || (al.artists || [])[0] || ''))}`,
      name: String(al.name || ''), artist: al.album_artist || (al.artists || [])[0] ? String(al.album_artist || (al.artists || [])[0]) : undefined,
      songCount: al.track_count ? Number(al.track_count) : undefined,
      year: al.year ? Number(al.year) : undefined,
      cover: al.album_art_file ? `${a.base}/album-art/${String(al.album_art_file).split('/').map(enc).join('/')}?token=${enc(a.token || '')}` : undefined,
    }));
  },
  async artists(a: ProviderAcct): Promise<PvArtist[]> {
    const d = await jfetch(`${a.base}/api/v1/db/artists`, { method: 'POST', headers: { 'x-access-token': a.token || '' }, body: JSON.stringify({ limit: 500, offset: 0 }) });
    return (d.artists || []).map((name: string) => ({ id: enc(name), name: String(name) }));
  },
  async artistAlbums(a: ProviderAcct, artistEnc: string): Promise<PvAlbum[]> {
    const d = await jfetch(`${a.base}/api/v1/db/artists-albums`, { method: 'POST', headers: { 'x-access-token': a.token || '' }, body: JSON.stringify({ artist: dec(artistEnc), limit: 500, offset: 0 }) });
    return (d.albums || []).map((al: any) => ({
      id: `${enc(String(al.name))}|${enc(String(al.album_artist || dec(artistEnc)))}`,
      name: String(al.name || ''), artist: dec(artistEnc),
      songCount: al.track_count ? Number(al.track_count) : undefined,
      cover: al.album_art_file ? `${a.base}/album-art/${String(al.album_art_file).split('/').map(enc).join('/')}?token=${enc(a.token || '')}` : undefined,
    }));
  },
  async randomSongs(a: ProviderAcct, size = 100): Promise<SongItem[]> {
    // v5 random-songs 单次上限 25 → 分批拉
    const out: SongItem[] = [];
    const batches = Math.min(4, Math.ceil(size / 25));
    for (let i = 0; i < batches; i++) {
      try {
        const d = await jfetch(`${a.base}/api/v1/db/random-songs`, { method: 'POST', headers: { 'x-access-token': a.token || '' }, body: JSON.stringify({ limit: 25 }) });
        (d.songs || []).forEach((s: any) => out.push(msSong(a.id, a.base, a.token || '', s)));
      } catch { break; }
    }
    return shuffle(out);
  },
  async playlists(a: ProviderAcct): Promise<PvPlaylist[]> {
    const d = await jfetch(`${a.base}/api/v1/playlist/getall`, { method: 'POST', headers: { 'x-access-token': a.token || '' }, body: '{}' });
    return (Array.isArray(d) ? d : d.playlists || []).map((p: any) => ({ id: enc(String(p.name)), name: String(p.name || '') }));
  },
  async playlistSongs(a: ProviderAcct, playlistEnc: string): Promise<SongItem[]> {
    const d = await jfetch(`${a.base}/api/v1/playlist/load`, { method: 'POST', headers: { 'x-access-token': a.token || '' }, body: JSON.stringify({ playlistname: dec(playlistEnc) }) });
    return (Array.isArray(d) ? d : d.songs || []).map((s: any) => msSong(a.id, a.base, a.token || '', s));
  },
  async albumSongs(a: ProviderAcct, albumEncPair: string): Promise<SongItem[]> {
    const [albumE] = albumEncPair.split('|');
    const d = await jfetch(`${a.base}/api/v1/db/album-songs`, { method: 'POST', headers: { 'x-access-token': a.token || '' }, body: JSON.stringify({ album: dec(albumE), limit: 500, offset: 0 }) });
    return (Array.isArray(d) ? d : d.songs || []).map((s: any) => msSong(a.id, a.base, a.token || '', s));
  },
  streamOf(a: ProviderAcct, itemId: string): StreamResult {
    // itemId = percent-encoded "vpath/Artist/Album/01.flac"
    return { url: `${a.base}/media/${itemId}?token=${enc(a.token || '')}` };
  },
  async scrobble(): Promise<void> { /* lastfm 需服务端配置，v1 不接 */ },
};

// ---------- Songloft（Go 自托管；JWT 双 token + facets 聚合） ----------
function slSong(pid: string, base: string, token: string, s: any): SongItem {
  return {
    name: String(s.title || '未知曲目'),
    singer: String(s.artist || ''),
    source: 'songloft',
    songmid: `${pid}:${s.id}`,
    albumId: s.album ? enc(String(s.album)) : '',
    albumName: s.album ? String(s.album) : undefined,
    interval: fmtSec(Number(s.duration)),
    img: s.cover_url ? String(s.cover_url) : `${base}/api/v1/songs/${s.id}/cover?access_token=${enc(token)}`,
  } as SongItem;
}
const sl = {
  async connect(a: ProviderAcct): Promise<ProviderAcct> {
    const base = norm(a.base);
    const d = await jfetch(`${base}/api/v1/auth/login`, { method: 'POST', body: JSON.stringify({ username: a.user, password: a.pass }) });
    if (!d.access_token) throw new Error('登录失败：账号或密码错误');
    return { ...a, base, token: String(d.access_token), tfRefresh: String(d.refresh_token || ''), name: a.name.trim() || 'Songloft' };
  },
  async albums(a: ProviderAcct): Promise<PvAlbum[]> {
    const d = await jfetch(`${a.base}/api/v1/songs/facets?field=album&limit=500${a.token ? `&access_token=${enc(a.token)}` : ''}`);
    return (d.facets || []).map((f: any) => ({ id: enc(String(f.value)), name: String(f.value), songCount: f.count ? Number(f.count) : undefined, cover: f.cover_url ? String(f.cover_url) : undefined }));
  },
  async artists(a: ProviderAcct): Promise<PvArtist[]> {
    const d = await jfetch(`${a.base}/api/v1/songs/facets?field=artist&limit=500${a.token ? `&access_token=${enc(a.token)}` : ''}`);
    return (d.facets || []).map((f: any) => ({ id: enc(String(f.value)), name: String(f.value), albumCount: f.count ? Number(f.count) : undefined, cover: f.cover_url ? String(f.cover_url) : undefined }));
  },
  async artistAlbums(a: ProviderAcct, artistEnc: string): Promise<PvAlbum[]> {
    const artist = dec(artistEnc);
    const d = await jfetch(`${a.base}/api/v1/songs?artist=${enc(artist)}&limit=500&offset=0${a.token ? `&access_token=${enc(a.token)}` : ''}`);
    const byAlbum = new Map<string, { count: number; cover?: string }>();
    for (const s of d.songs || []) {
      const k = String(s.album || '其他');
      const cur = byAlbum.get(k) || { count: 0 };
      cur.count++;
      if (!cur.cover && s.cover_url) cur.cover = String(s.cover_url);
      byAlbum.set(k, cur);
    }
    return [...byAlbum.entries()].map(([name, v]) => ({ id: enc(name), name, songCount: v.count, cover: v.cover }));
  },
  async randomSongs(a: ProviderAcct, size = 100): Promise<SongItem[]> {
    let songs: any[] = [];
    try {
      const d = await jfetch(`${a.base}/api/v1/songs/random?limit=${size}${a.token ? `&access_token=${enc(a.token)}` : ''}`);
      songs = d.songs || [];
    } catch {
      const d = await jfetch(`${a.base}/api/v1/songs?limit=500&offset=0${a.token ? `&access_token=${enc(a.token)}` : ''}`);
      songs = d.songs || [];
    }
    return shuffle(songs.map((s: any) => slSong(a.id, a.base, a.token || '', s))).slice(0, size);
  },
  async playlists(a: ProviderAcct): Promise<PvPlaylist[]> {
    const d = await jfetch(`${a.base}/api/v1/playlists?limit=200&offset=0${a.token ? `&access_token=${enc(a.token)}` : ''}`);
    return (d.playlists || []).map((p: any) => ({ id: String(p.id), name: String(p.name || ''), songCount: p.song_count ? Number(p.song_count) : undefined, cover: p.cover_url ? String(p.cover_url) : undefined }));
  },
  async playlistSongs(a: ProviderAcct, playlistId: string): Promise<SongItem[]> {
    const d = await jfetch(`${a.base}/api/v1/playlists/${playlistId}/songs?limit=500&offset=0&sort=position&order=asc${a.token ? `&access_token=${enc(a.token)}` : ''}`);
    return (d.songs || []).map((s: any) => slSong(a.id, a.base, a.token || '', s));
  },
  async albumSongs(a: ProviderAcct, albumEnc: string): Promise<SongItem[]> {
    const d = await jfetch(`${a.base}/api/v1/songs?album=${albumEnc}&limit=500&offset=0${a.token ? `&access_token=${enc(a.token)}` : ''}`);
    return (d.songs || []).map((s: any) => slSong(a.id, a.base, a.token || '', s));
  },
  streamOf(a: ProviderAcct, itemId: string): StreamResult {
    return { url: `${a.base}/api/v1/songs/${itemId}/play?access_token=${enc(a.token || '')}` };
  },
  async scrobble(a: ProviderAcct, songId: string): Promise<void> {
    try { await jfetch(`${a.base}/api/v1/songs/${songId}/played?source=nextmusic&type=finish`, { method: 'POST', headers: { Authorization: `Bearer ${a.token}` } }); } catch { /* 统计尽力而为 */ }
  },
};

// ---------- 飞牛音乐 fnOS（应用级账号 + music-token；协议依据 kuilei0926/FeiNiuMusic 客户端源码 + infowe.site 逆向手册） ----------
// 鉴权: POST /music/api/v1/user/password-login {username, password: sha256hex, deviceId} → data.userToken
// 请求: Cookie: music-token=<token>（web 场景流/封面 URL 追加 ?music-token= 回退；安全码存 a.root → x-access-code base64 + x-access-source: app）
// 响应包络: {code, msg, data}；code 0=成功 99999=INVALID TOKEN 120001=账密错误
// 端点: /track/list /album/list-all /artist/list-all /playlist/list /track/album-detail|artist-detail|playlist-detail/list /track/stream?guid= /static/cover?coverId=
function sha256hex(s: string): string {
  // 纯 JS 实现（RN 无 node:crypto；HTTP 页面下 crypto.subtle 不可用）
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / 2 ** (8 * i)) & 0xff);
  const w = new Uint32Array(64);
  const rr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map(x => x.toString(16).padStart(8, '0')).join('');
}

/** base64（浏览器 btoa + RN 兜底） */
function b64(s: string): string {
  try { return btoa(s); } catch {
    const bytes: number[] = []; const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0x80) bytes.push(c); else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63)); else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i], b1 = bytes[i + 1] ?? 0, b2 = bytes[i + 2] ?? 0;
      out += CH[b0 >> 2] + CH[((b0 & 3) << 4) | (b1 >> 4)] + (i + 1 < bytes.length ? CH[((b1 & 15) << 2) | (b2 >> 6)] : '=') + (i + 2 < bytes.length ? CH[b2 & 63] : '=');
    }
    return out;
  }
}

function fnApi(base: string): string { return `${norm(base)}/music/api/v1`; }
function fnHeaders(a: ProviderAcct): Record<string, string> {
  const h: Record<string, string> = { Cookie: `music-token=${a.token || ''}` };
  if (a.root) { h['x-access-code'] = b64(a.root); h['x-access-source'] = 'app'; } // fnOS 安全码
  return h;
}
/** 解包 {code,msg,data}；list 页形态兼容 data.list / data 数组 / 裸数组
 *  鉴权双通道：Cookie 头（原生端有效）+ music-token query（浏览器 fetch 禁设 Cookie 头，跨域必须走 query 回退）*/
async function fnGet(a: ProviderAcct, path: string, params?: Record<string, string | number>): Promise<any> {
  const q: Record<string, string | number> = { ...(params || {}), 'music-token': a.token || '' };
  const qs = '?' + Object.entries(q).map(([k, v]) => `${k}=${enc(String(v))}`).join('&');
  const d = await jfetch(`${fnApi(a.base)}${path}${qs}`, { headers: fnHeaders(a) });
  if (d && typeof d === 'object' && 'code' in d) {
    if (d.code !== 0) throw new Error(String(d.msg || `code ${d.code}`));
    return d.data;
  }
  return d;
}
function fnList(d: any): any[] {
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.list)) return d.list;
  if (d && Array.isArray(d.tracks)) return d.tracks;
  return [];
}
function fnSong(pid: string, base: string, token: string, t: any): SongItem {
  const artists: string[] = (t.artists || []).map((x: any) => String(x.name || '')).filter(Boolean);
  return {
    name: String(t.title || '未知曲目'),
    singer: artists.join(' / '),
    source: 'feiniu',
    songmid: `${pid}:${String(t.guid || '')}`,
    albumId: t.album ? String(t.album.guid || '') : '',
    albumName: t.album ? String(t.album.name || '') || undefined : undefined,
    interval: fmtSec(Number(t.duration)),
    img: t.coverId ? `${fnApi(base)}/static/cover?coverId=${enc(String(t.coverId))}&size=200&music-token=${enc(token)}` : undefined,
  } as SongItem;
}
const fn = {
  async connect(a: ProviderAcct): Promise<ProviderAcct> {
    const base = norm(a.base);
    const headers: Record<string, string> = {};
    if (a.root) { headers['x-access-code'] = b64(a.root); headers['x-access-source'] = 'app'; }
    const d = await jfetch(`${fnApi(base)}/user/password-login`, {
      method: 'POST', headers,
      body: JSON.stringify({ username: a.user, password: sha256hex(a.pass), deviceId: `nextmusic-${a.id.slice(-8)}` }),
    });
    const token = d && d.data ? String(d.data.userToken || '') : String((d as any)?.userToken || '');
    if (!token) throw new Error(d && d.msg ? String(d.msg) : '登录失败（检查账号密码/安全码）');
    let name = a.name.trim();
    if (!name) { try { const c = await jfetch(`${fnApi(base)}/sys/config`); name = String(c?.data?.serverName || '飞牛音乐'); } catch { name = '飞牛音乐'; } }
    return { ...a, base, token, name };
  },
  async albums(a: ProviderAcct): Promise<PvAlbum[]> {
    const d = await fnGet(a, '/album/list-all');
    return fnList(d).map((al: any) => ({
      id: String(al.guid || ''), name: String(al.name || ''),
      songCount: al.trackCount != null ? Number(al.trackCount) : undefined,
      year: al.releaseDate ? Number(String(al.releaseDate).slice(0, 4)) || undefined : undefined,
      cover: al.coverId ? `${fnApi(a.base)}/static/cover?coverId=${enc(String(al.coverId))}&size=200&music-token=${enc(a.token || '')}` : undefined,
    }));
  },
  async artists(a: ProviderAcct): Promise<PvArtist[]> {
    const d = await fnGet(a, '/artist/list-all');
    return fnList(d).map((ar: any) => ({
      id: String(ar.guid || ''), name: String(ar.name || ''),
      songCount: ar.trackCount != null ? Number(ar.trackCount) : undefined,
      cover: ar.coverId ? `${fnApi(a.base)}/static/cover?coverId=${enc(String(ar.coverId))}&size=200&music-token=${enc(a.token || '')}` : undefined,
    }));
  },
  async artistAlbums(a: ProviderAcct, artistId: string): Promise<PvAlbum[]> {
    // fnOS 无 artist→album 端点：拉艺术家曲目客户端聚合
    const d = await fnGet(a, '/track/artist-detail/list', { artistGuid: artistId, page: 1, size: 500 });
    const byAlbum = new Map<string, { name: string; count: number; coverId?: string }>();
    fnList(d).forEach((t: any) => {
      const g = t.album?.guid ? String(t.album.guid) : '_';
      const cur = byAlbum.get(g) || { name: t.album?.name ? String(t.album.name) : '未分组', count: 0, coverId: t.coverId ? String(t.coverId) : undefined };
      cur.count++; byAlbum.set(g, cur);
    });
    return [...byAlbum.entries()].map(([g, v]) => ({
      id: g, name: v.name, songCount: v.count,
      cover: v.coverId ? `${fnApi(a.base)}/static/cover?coverId=${enc(v.coverId)}&size=200&music-token=${enc(a.token || '')}` : undefined,
    }));
  },
  async randomSongs(a: ProviderAcct, size = 60): Promise<SongItem[]> {
    const d = await fnGet(a, '/track/list', { page: 1, size: Math.min(200, Math.max(size, 50)) });
    return shuffle(fnList(d).map((t: any) => fnSong(a.id, a.base, a.token || '', t))).slice(0, size);
  },
  async playlists(a: ProviderAcct): Promise<PvPlaylist[]> {
    const d = await fnGet(a, '/playlist/list', { page: 1, size: 200 });
    return fnList(d).map((p: any) => ({ id: String(p.guid || ''), name: String(p.name || ''), songCount: p.trackCount != null ? Number(p.trackCount) : undefined }));
  },
  async playlistSongs(a: ProviderAcct, playlistId: string): Promise<SongItem[]> {
    const d = await fnGet(a, '/track/playlist-detail/list', { playlistGuid: playlistId, page: 1, size: 500 });
    return fnList(d).map((t: any) => fnSong(a.id, a.base, a.token || '', t));
  },
  async albumSongs(a: ProviderAcct, albumId: string): Promise<SongItem[]> {
    const d = await fnGet(a, '/track/album-detail/list', { albumGuid: albumId, page: 1, size: 500 });
    return fnList(d).map((t: any) => fnSong(a.id, a.base, a.token || '', t));
  },
  streamOf(a: ProviderAcct, itemId: string): StreamResult {
    // 原生端 Cookie 头；web 端 query 回退（跨域 <audio> 不发 Cookie）
    return { url: `${fnApi(a.base)}/track/stream?guid=${itemId}&music-token=${enc(a.token || '')}`, headers: { Cookie: `music-token=${a.token || ''}` } };
  },
  async scrobble(): Promise<void> { /* /play-history 形态未定，v1 不回写 */ },
};

// ---------- 道理鱼（daoliyu-music-server 官方协议；2026-09-18 老板给源码后实测 v1.0.3 落地，替换原 Subsonic 占位） ----------
// 登录: POST /api/auth/login {email|username, password} → {token: JWT, user}
// 鉴权: Authorization: Bearer；流地址 ?token=JWT（实测支持，web <audio> 可用）
// 响应: {items, total, skip, take}；曲目 item 含 artist/album 嵌套；歌单项为 {id, track}
function dlySong(pid: string, base: string, t: any): SongItem {
  return {
    name: String(t.title || '未知曲目'),
    singer: String(t.artistName || (t.artist && t.artist.name) || ((t.artists || [])[0] || {}).name || ''),
    source: 'daoliyu',
    songmid: `${pid}:${String(t.id || '')}`,
    albumId: t.album ? String(t.album.id || '') : '',
    albumName: t.album ? String(t.album.title || '') || undefined : undefined,
    interval: fmtSec(Number(t.durationSeconds || t.duration)),
  } as SongItem;
}
const dly = {
  async connect(a: ProviderAcct): Promise<ProviderAcct> {
    const base = norm(a.base);
    const d = await jfetch(`${base}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email: a.user, username: a.user, password: a.pass }) });
    const token = String(d?.token || '');
    if (!token) throw new Error(d?.message || '登录失败');
    return { ...a, base, token, name: a.name.trim() || String(d?.user?.displayName || '道理鱼音乐') };
  },
  async albums(a: ProviderAcct): Promise<PvAlbum[]> {
    const d = await jfetch(`${a.base}/api/library/albums?take=500`, { headers: { Authorization: `Bearer ${a.token || ''}` } });
    return ((d.items || []) as any[]).map(al => ({
      id: String(al.id), name: String(al.title || ''),
      artist: al.albumArtist ? String(al.albumArtist) : undefined,
      songCount: al.trackCount != null ? Number(al.trackCount) : undefined,
      year: al.releaseYear ? Number(al.releaseYear) : undefined,
    }));
  },
  async artists(a: ProviderAcct): Promise<PvArtist[]> {
    const d = await jfetch(`${a.base}/api/library/artists?take=500`, { headers: { Authorization: `Bearer ${a.token || ''}` } });
    return ((d.items || []) as any[]).map(ar => ({ id: String(ar.id), name: String(ar.name || ''), songCount: ar.trackCount != null ? Number(ar.trackCount) : undefined }));
  },
  async artistAlbums(a: ProviderAcct, artistId: string): Promise<PvAlbum[]> {
    // 详情含 tracks[] → 客户端按 album 聚合（服务器无 artist→album 端点）
    const d = await jfetch(`${a.base}/api/library/artists/${enc(artistId)}`, { headers: { Authorization: `Bearer ${a.token || ''}` } });
    const by = new Map<string, { name: string; count: number }>();
    ((d.tracks || []) as any[]).forEach(t => {
      const g = t.album?.id ? String(t.album.id) : '_';
      const cur = by.get(g) || { name: t.album?.title ? String(t.album.title) : '未分组', count: 0 };
      cur.count++; by.set(g, cur);
    });
    return [...by.entries()].map(([id, v]) => ({ id, name: v.name, songCount: v.count }));
  },
  async randomSongs(a: ProviderAcct, size = 60): Promise<SongItem[]> {
    const d = await jfetch(`${a.base}/api/tracks/random?take=${Math.min(200, Math.max(size, 30))}`, { headers: { Authorization: `Bearer ${a.token || ''}` } });
    return ((d.items || []) as any[]).map(t => dlySong(a.id, a.base, t)).slice(0, size);
  },
  async playlists(a: ProviderAcct): Promise<PvPlaylist[]> {
    const d = await jfetch(`${a.base}/api/playlists/web/mine`, { headers: { Authorization: `Bearer ${a.token || ''}` } });
    return ((Array.isArray(d) ? d : d.items || []) as any[]).map(p => ({ id: String(p.id), name: String(p.name || ''), songCount: p.trackCount != null ? Number(p.trackCount) : undefined }));
  },
  async playlistSongs(a: ProviderAcct, playlistId: string): Promise<SongItem[]> {
    const d = await jfetch(`${a.base}/api/playlists/${enc(playlistId)}/tracks?take=500`, { headers: { Authorization: `Bearer ${a.token || ''}` } });
    return ((d.items || []) as any[]).map(it => dlySong(a.id, a.base, it.track || it));
  },
  async albumSongs(a: ProviderAcct, albumId: string): Promise<SongItem[]> {
    // track-ids → 全曲目表 join（一次拉全量小库场景够用；大库后续可换分页）
    const [ids, all] = await Promise.all([
      jfetch(`${a.base}/api/library/albums/${enc(albumId)}/track-ids`, { headers: { Authorization: `Bearer ${a.token || ''}` } }),
      jfetch(`${a.base}/api/tracks?take=500`, { headers: { Authorization: `Bearer ${a.token || ''}` } }),
    ]);
    const idSet = new Set((ids.items || []).map((x: any) => String(x)));
    return ((all.items || []) as any[]).filter(t => idSet.has(String(t.id))).map(t => dlySong(a.id, a.base, t));
  },
  streamOf(a: ProviderAcct, itemId: string): StreamResult {
    return { url: `${a.base}/api/tracks/${enc(itemId)}/stream?token=*** || '')}`, headers: { Authorization: `Bearer ${a.token || ''}` } };
  },
  async scrobble(a: ProviderAcct, itemId: string): Promise<void> {
    try { await jfetch(`${a.base}/api/library/playback-history`, { method: 'POST', headers: { Authorization: `Bearer ${a.token || ''}` }, body: JSON.stringify({ trackId: dec(itemId), positionSeconds: 1, durationSeconds: 1 }) }); } catch { /* 统计尽力而为 */ }
  },
};

// ---------- 分发表 ----------
export const V2 = { plex, abs, syno, ms, sl, fn, dly };
export const V2_ENGINES: Record<string, keyof typeof V2> = {
  plex: 'plex', audiobookshelf: 'abs', audiostation: 'syno', mstream: 'ms', songloft: 'sl', feiniu: 'fn', daoliyu: 'dly',
};
export function isV2Type(t: string): t is keyof typeof V2_ENGINES { return t in V2_ENGINES; }
