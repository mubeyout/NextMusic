// myLibrary.ts —— 「我的曲库」数据层(老板 0924 一等公民 P1,D0.5 接口层)
// 服务端:/api/music/library/* 聚合 + /api/music/custom/{file,cover} 流/图(token query 兜底,audio/Image 组件可直载)
// 播放身份:SongItem.source='custom',songmid=库内 id,hash=filename(播放/封面原料)
import { req, store, normalizeBase } from './server';
import type { SongItem } from './server';

export interface LibArtist { id: string; name: string; songCount: number; albumCount: number; coverFile: string | null; mtime?: number }
export interface LibAlbum { id: string; name: string; artist: string; artistCount?: number; songCount: number; coverFile: string | null; subPath: string; byDir?: boolean; mtime: number }
export interface LibSong {
  id: string; songmid: string; name: string; singer: string; album: string;
  interval: string; quality: string; filename: string; subPath: string;
  ext: string; hasCover: boolean; hasLyric: boolean; mtime: number; size: number;
}
export interface LibStats { songs: number; artists: number; albums: number; totalBytes: number }

const B = () => normalizeBase(store.base);

/** 库内曲目 → SongItem(source='custom';hash=filename 供流/封面构造) */
export function toSongItem(l: LibSong): SongItem {
  const s: SongItem = {
    name: l.name || l.filename.split('/').pop() || '未知曲目',
    singer: l.singer || '未知歌手',
    source: 'custom',
    songmid: l.songmid || l.id,
    albumId: '',
    interval: l.interval || '',
    hash: l.filename,
    albumName: l.album || undefined,
  } as SongItem;
  return s;
}

/** 播放流地址(Range ✓,token 走 query——audio 标签带不了 header) */
export function streamUrl(filename: string): string {
  const b = B();
  return b
    ? `${b}/api/music/custom/file?filename=${encodeURIComponent(filename)}&user=${encodeURIComponent(store.username || '')}&token=${encodeURIComponent(store.token || '')}`
    : '';
}

/** 封面地址(嵌入图代打;无 token 同样空串) */
export function coverUrl(filename: string): string {
  const b = B();
  return b && store.token
    ? `${b}/api/music/custom/cover?filename=${encodeURIComponent(filename)}&user=${encodeURIComponent(store.username || '')}&token=${encodeURIComponent(store.token)}`
    : '';
}

// ── API(req() 自动带 base+x-user-token) ──
export const myLib = {
  stats(): Promise<LibStats> { return req('/api/music/library/stats') as Promise<LibStats>; },
  artists(offset = 0, limit = 0): Promise<{ artists: LibArtist[]; total: number }> {
    return req(`/api/music/library/artists?offset=${offset}&limit=${limit}`) as never;
  },
  artist(id: string): Promise<{ artist: LibArtist; albums: LibAlbum[]; songs: LibSong[] }> {
    return req(`/api/music/library/artist?id=${encodeURIComponent(id)}`) as never;
  },
  albums(type: 'newest' | 'recent' | 'random' = 'newest', size = 60, offset = 0): Promise<{ albums: LibAlbum[]; total: number }> {
    return req(`/api/music/library/albums?type=${type}&size=${size}&offset=${offset}`) as never;
  },
  album(id: string): Promise<{ album: LibAlbum; songs: LibSong[] }> {
    return req(`/api/music/library/album?id=${encodeURIComponent(id)}`) as never;
  },
  songs(type: 'recent' | 'random' = 'recent', size = 30): Promise<{ songs: LibSong[] }> {
    return req(`/api/music/library/songs?type=${type}&size=${size}`) as never;
  },
  /** 触发扫描(进屏手动刷新用);扫描后聚合缓存服务端已联动失效 */
  sync(): Promise<void> { return req('/api/music/custom/sync', { method: 'POST' }) as never; },
};

// ── P1b 上传链路(0924 老板追加:客户端→服务器导入,传完即上墙) ──
export interface UploadItem { uri: string; name: string; mime?: string }
export interface UploadResult {
  success: boolean; uploaded: { name: string; size: number }[];
  skipped: string[]; failed: { name: string; reason: string }[];
  stats?: LibStats | null; message?: string;
  byDirSplit?: { id3Full: number; byDir: number } | null; // v1.1 完成卡拆分
}

/** 批量上传到我的曲库(XHR 带 upload progress,RN 原生/web 同构;服务端自动增量扫描+聚合失效) */
export function uploadToLibrary(
  items: UploadItem[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<UploadResult> {
  const b = B();
  if (!b || !store.token) return Promise.reject(new Error('请先登录服务器'));
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    for (const it of items) {
      const ext = (it.name.split('.').pop() || 'mp3').toLowerCase();
      const mime = it.mime || (ext === 'flac' ? 'audio/flac' : ext === 'm4a' ? 'audio/mp4' : ext === 'ogg' ? 'audio/ogg' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg');
      // RN 原生 FormData 吃 {uri,name,type};web 吃 Blob/File(URI 形如 blob:/file: 也被当 URI 处理失败时由上层改传 File——三形态 UI 层适配)
      fd.append('files', { uri: it.uri, name: it.name, type: mime } as never);
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', b + '/api/music/custom/upload');
    xhr.setRequestHeader('x-user-token', store.token);
    if (store.username) xhr.setRequestHeader('x-user-name', store.username);
    if (xhr.upload && onProgress) xhr.upload.onprogress = ev => { if (ev.total) onProgress(ev.loaded, ev.total); };
    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.onload = () => {
      try {
        const d = JSON.parse(xhr.responseText) as UploadResult;
        if (xhr.status >= 200 && xhr.status < 300 && d.success) resolve(d);
        else reject(new Error(d.message || ('HTTP ' + xhr.status)));
      } catch { reject(new Error('HTTP ' + xhr.status)); }
    };
    xhr.send(fd);
  });
}
