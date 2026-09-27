// myLibrary.ts —— 「我的曲库」数据层(老板 0924 一等公民 P1,D0.5 接口层)
// 服务端:/api/music/library/* 聚合 + /api/music/custom/{file,cover} 流/图(token query 兜底,audio/Image 组件可直载)
// 播放身份:SongItem.source='custom',songmid=库内 id,hash=filename(播放/封面原料)
import { Platform } from 'react-native';
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
export function toSongItem(l: LibSong, lib?: string): SongItem {
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
  if (lib) (s as SongItem & { _lib?: string })._lib = lib; // ④公共曲库:lib 随歌携带(队列/详情跨页播放不丢域)
  return s;
}

// v1.2→④:当前活跃库(播放/封面 URL 的 lib 参数默认源——切库即切换流地址域;公共曲库='public')
// ④下沉服务层:PlayerProvider 消费(getActiveLib),屏只负责切(setActiveLib)
let __activeLib: string | undefined;
export function setActiveLib(id?: string) { __activeLib = id; }
export function getActiveLib(): string | undefined { return __activeLib; }

// 走查❌#2 根因修复:web 同源部署形态 store.base=''(相对路径 fetch)——原 `b ? 绝对URL : ''` 在该形态返回空串
// → 播放 src 恒空/封面全灰。web(base 空)走相对路径,原生无 base 维持空串(由分支 toast 引导登录)
const IS_WEB_PLAT = Platform.OS === 'web';
const Q = (filename: string, lib?: string) =>
  `?filename=${encodeURIComponent(filename)}${lib ? `&lib=${encodeURIComponent(lib)}` : ''}&user=${encodeURIComponent(store.username || '')}&token=${encodeURIComponent(store.token || '')}`;

/** 播放流地址(Range ✓,token 走 query——audio 标签带不了 header) */
export function streamUrl(filename: string, lib?: string): string {
  const b = B();
  if (!b) return IS_WEB_PLAT ? '/api/music/custom/file' + Q(filename, lib) : '';
  return `${b}/api/music/custom/file` + Q(filename, lib);
}

/** 封面地址(嵌入图代打;web 同源走相对,原生需 base+token) */
export function coverUrl(filename: string, lib?: string): string {
  const b = B();
  if (!b) return IS_WEB_PLAT && store.token ? '/api/music/custom/cover' + Q(filename, lib) : '';
  return store.token ? `${b}/api/music/custom/cover` + Q(filename, lib) : '';
}


// C12(质感整改):乐观缓存——点过的详情/上次列表先渲染秒开,网络刷新覆盖(SWR)
import { createMMKV } from 'react-native-mmkv';
const libKv = createMMKV({ id: 'nextmusic-libcache' });
export const libCache = {
  get<T>(k: string): T | null { try { const v = libKv.getString(k); return v ? JSON.parse(v) as T : null; } catch { return null; } },
  set(k: string, v: unknown): void { try { libKv.set(k, JSON.stringify(v)); } catch { /* 配额满忽略 */ } },
};
// ── API(req() 自动带 base+x-user-token) ──
// lx185(老板 0924 03:56 toLocaleString 崩溃):服务端返回 {success,data} 信封,客户端原样断言 → stats.songs=undefined → .toLocaleString() 白屏;
// 统一解包:unwrap() 取 .data,无 data 时抛错(让调用方 catch 走降级)
async function unwrap<T>(p: Promise<unknown>): Promise<T> {
  const r = await p as { success?: boolean; data?: T; message?: string };
  if (r && typeof r === 'object' && 'data' in r) {
    if (r.success === false) throw new Error(r.message || '服务器返回失败');
    return r.data as T;
  }
  return r as T;
}
export const myLib = {
  /** 质感#3:进屏一揽子端点(四路串行→一次往返) */
  home(lib?: string): Promise<{ stats: LibStats; albums: LibAlbum[]; artists: LibArtist[]; recent: LibSong[] }> {
    return unwrap<never>(req('/api/music/library/home' + (lib ? `?lib=${encodeURIComponent(lib)}` : '')));
  },
  /** v1.2 三层库:共享库可见清单(锁态也返回,锁卡渲染数据) */
  sharedList(): Promise<{ libs: { id: string; name: string; access: string; locked: boolean; songCountHint: number; syncedAt: number }[] }> {
    return unwrap<never>(req('/api/music/library/shared/list'));
  },
  stats(lib?: string): Promise<LibStats> { return unwrap<LibStats>(req('/api/music/library/stats' + (lib ? `?lib=${encodeURIComponent(lib)}` : ''))); },
  /** C12 SWR:缓存先行回调+网络刷新覆盖(列表/详情通用) */
  async swr<T>(cacheKey: string, fetcher: () => Promise<T>, onCached?: (v: T) => void): Promise<T> {
    if (cacheKey) {
      const c = libCache.get<T>(cacheKey);
      if (c !== null && onCached) onCached(c);
    }
    const fresh = await fetcher();
    if (cacheKey) libCache.set(cacheKey, fresh);
    return fresh;
  },
  artists(offset = 0, limit = 0): Promise<{ artists: LibArtist[]; total: number }> {
    return unwrap<never>(req(`/api/music/library/artists?offset=${offset}&limit=${limit}`)); // lib 透传走 home/详情足用,artists 单查加 lib 时不常用
  },
  artist(id: string, lib?: string): Promise<{ artist: LibArtist; albums: LibAlbum[]; songs: LibSong[] }> {
    return unwrap<never>(req(`/api/music/library/artist?id=${encodeURIComponent(id)}${lib ? `&lib=${encodeURIComponent(lib)}` : ''}`));
  },
  albums(type: 'newest' | 'recent' | 'random' = 'newest', size = 60, offset = 0): Promise<{ albums: LibAlbum[]; total: number }> {
    return unwrap<never>(req(`/api/music/library/albums?type=${type}&size=${size}&offset=${offset}`));
  },
  album(id: string, lib?: string): Promise<{ album: LibAlbum; songs: LibSong[] }> {
    return unwrap<never>(req(`/api/music/library/album?id=${encodeURIComponent(id)}${lib ? `&lib=${encodeURIComponent(lib)}` : ''}`));
  },
  songs(type: 'recent' | 'random' = 'recent', size = 30): Promise<{ songs: LibSong[] }> {
    return unwrap<never>(req(`/api/music/library/songs?type=${type}&size=${size}`));
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
  targetLib?: string, // v1.2 spec⑪A:上传目标(''=我的曲库|共享库 id)
): Promise<UploadResult> {
  const b = B();
  if (!b || !store.token) return Promise.reject(new Error('请先登录服务器'));
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    const isWeb = Platform.OS === 'web';
    (async () => {
      for (const it of items) {
        const ext = (it.name.split('.').pop() || 'mp3').toLowerCase();
        const mime = it.mime || (ext === 'flac' ? 'audio/flac' : ext === 'm4a' ? 'audio/mp4' : ext === 'ogg' ? 'audio/ogg' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg');
        if (isWeb) {
          // 走查❌#3:浏览器 FormData 不认 {uri,name,type}(序列化成"[object Object]"→0 文件达服务器)——web 转 Blob
          try {
            const blob = await fetch(it.uri).then(r => r.blob());
            fd.append('files', blob, it.name);
          } catch { fd.append('files', new Blob([new Uint8Array(0)], { type: mime }), it.name); }
        } else {
          // RN 原生 FormData 吃 {uri,name,type}(content:// 与 file:// 均可)
          fd.append('files', { uri: it.uri, name: it.name, type: mime } as never);
        }
      }
    })().finally(() => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', b + '/api/music/custom/upload' + (targetLib ? `?lib=${encodeURIComponent(targetLib)}` : ''));
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
  });
}
