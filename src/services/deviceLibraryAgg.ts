// deviceLibraryAgg.ts —— 设备本地库聚合层(P2.5 0924,MOMO 放行)
// 端上聚合(devicelibrary 扫描结果 → 歌手/专辑/最近/随机),零服务端;类型形状与 LibArtist/LibAlbum/LibSong
// 对齐——「一套皮换数据源」:MyLibraryScreen 组件族直接吃。Android 先行;Web 无目录能力(降级引导上传)。
import { deviceSongsDetailed } from './devicelibrary';
import type { SongItem } from './server';
import type { LibArtist, LibAlbum, LibSong } from './myLibrary';

const normArtist = (s: string) => String(s || '').trim() || '未知歌手';
const artistKeyOf = (s: string) => normArtist(String(s || '').split(/[/、,;&+]/)[0]);

function albumKeyOf(s: SongItem): { key: string; name: string; byDir: boolean } {
  const tag = String(s.albumName || '').trim();
  if (tag) return { key: 'tag:' + tag.toLowerCase(), name: tag, byDir: false };
  return { key: 'dir:__device__', name: '本机音乐', byDir: true }; // 设备库无子路径:归一档(有 albumName 的按 ID3 分)
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (s.charCodeAt(i) + ((h << 5) - h)) | 0;
  return 'dv_' + Math.abs(h).toString(36);
}

const toLibSong = (s: SongItem): LibSong => ({
  id: hash(s.songmid), songmid: s.songmid,
  name: s.name, singer: s.singer || '', album: s.albumName || '',
  interval: s.interval || '', quality: '', // 设备库无音质分级
  filename: s.songmid, subPath: '',
  ext: (s.songmid.split('.').pop() || '').toLowerCase(),
  hasCover: false, hasLyric: false, // MediaStore 无封面元数据,UI 走渐变兜底
  mtime: 0, size: 0,
});

export interface DeviceLibResult {
  stats: { songs: number; artists: number; albums: number; totalBytes: number };
  artists: LibArtist[];
  albums: LibAlbum[];
  songs: LibSong[];
}

let cache: DeviceLibResult | null = null;

/** 扫描+聚合(带缓存;重扫调 invalidateDeviceAgg) */
export async function deviceLibraryAgg(): Promise<DeviceLibResult> {
  if (cache) return cache;
  const list = await deviceSongsDetailed();
  const artists = new Map<string, LibArtist & { _k: Set<string> }>();
  const albums = new Map<string, LibAlbum>();
  const songs: LibSong[] = [];
  for (const s of list) {
    const ak = artistKeyOf(s.singer);
    if (!artists.has(ak)) artists.set(ak, { id: hash('ar:' + ak), name: normArtist(ak), songCount: 0, albumCount: 0, coverFile: null, mtime: 0, _k: new Set() });
    const ar = artists.get(ak)!; ar.songCount++;
    const ab = albumKeyOf(s);
    if (!albums.has(ab.key)) albums.set(ab.key, { id: hash('al:' + ab.key), name: ab.name, artist: '', songCount: 0, coverFile: null, subPath: '', byDir: ab.byDir, mtime: 0 });
    const al = albums.get(ab.key)!; al.songCount++;
    if (al.artist && al.artist !== normArtist(s.singer || '')) al.artist = 'Various Artists';
    else if (!al.artist) al.artist = normArtist(s.singer || '');
    ar._k.add(ab.key);
    songs.push(toLibSong(s));
  }
  const result: DeviceLibResult = {
    stats: { songs: songs.length, artists: artists.size, albums: albums.size, totalBytes: 0 },
    artists: Array.from(artists.values()).map(({ _k, ...a }) => { a.albumCount = _k.size; return a; })
      .sort((a, b) => (b.songCount - a.songCount) || a.name.localeCompare(b.name, 'zh')),
    albums: Array.from(albums.values()).sort((a, b) => b.songCount - a.songCount),
    songs,
  };
  cache = result;
  return result;
}

export function invalidateDeviceAgg() { cache = null; }

/** 歌手详情(从聚合结果过滤,与服务器端 myLib.artist 同形) */
export async function deviceArtist(id: string): Promise<{ artist: LibArtist; albums: LibAlbum[]; songs: LibSong[] } | null> {
  const r = await deviceLibraryAgg();
  const artist = r.artists.find(a => a.id === id);
  if (!artist) return null;
  const ak = artistKeyOf(artist.name);
  const songs = r.songs.filter(s => artistKeyOf(s.singer) === ak);
  const albums = r.albums.filter(a => songs.some(s => a.artist.includes(normArtist(s.singer))) || a.artist === artist.name || a.byDir);
  return { artist, albums, songs };
}

/** 专辑详情 */
export async function deviceAlbum(id: string): Promise<{ album: LibAlbum; songs: LibSong[] } | null> {
  const r = await deviceLibraryAgg();
  const album = r.albums.find(a => a.id === id);
  if (!album) return null;
  const keyOfAlbum = album.byDir ? 'dir:__device__' : 'tag:' + album.name.toLowerCase();
  const keyOf = (s: LibSong) => (String(s.album || '').trim() ? 'tag:' + s.album.toLowerCase() : 'dir:__device__');
  return { album, songs: r.songs.filter(s => keyOf(s) === keyOfAlbum) };
}

/** 最近/随机(设备库无 mtime:最近=扫描序,随机=真随机) */
export async function deviceSongs(type: 'recent' | 'random', size = 30): Promise<LibSong[]> {
  const r = await deviceLibraryAgg();
  if (type === 'random') {
    const arr = r.songs.slice();
    const n = Math.min(size, arr.length);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(Math.random() * (arr.length - i));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, n);
  }
  return r.songs.slice(0, size);
}
