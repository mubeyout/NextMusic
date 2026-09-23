// 下载管理：解析取链（自定义音源/服务器/媒体库）→ 落盘到应用目录 → MMKV 索引
// 队列串行 + 并发上限；UI 通过 subscribe() 刷新
import RNBlobUtil from 'react-native-blob-util';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

// 原生 OkHttp 下载模块（DownloaderModule.kt）；不可用时回退 blob-util
const Downloader = NativeModules.Downloader as {
  download(key: string, url: string, filePath: string, headers: Record<string, string> | null, ): Promise<number>;
  downloadPublic(key: string, url: string, displayName: string, mime: string, headers: Record<string, string> | null): Promise<{ uri: string; size: number }>;
  downloadToTree(key: string, url: string, treeUri: string, displayName: string, mime: string, headers: Record<string, string> | null): Promise<{ uri: string; size: number }>;
  removePublic(uri: string): Promise<boolean>;
  cancelDownload(key: string): void;
} | undefined;

// vc82：content://（公共目录 MediaStore 记录）走原生 resolver.delete；file:// 走 unlink
function deleteFile(path: string) {
  if (path.startsWith('content://')) { Downloader?.removePublic?.(path).catch(() => {}); return; }
  RNBlobUtil.fs.unlink(localPath(path)).catch(() => {});
}

let progressSink: ((key: string, received: number, total: number) => void) | null = null;
export function setProgressSink(fn: ((key: string, received: number, total: number) => void) | null) { progressSink = fn; }
if (Downloader) {
  try {
    const emitter = new NativeEventEmitter(NativeModules.Downloader as never);
    emitter.addListener('DownloaderProgress', ((e: unknown) => {
      const ev = e as { key: string; received: number; total: number };
      progressSink?.(ev.key, ev.received, ev.total);
    }) as (...args: readonly object[]) => unknown);
  } catch { /* 事件模块不可用时仅无进度 */ }
}
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from './server';
import { api } from './server';
import { customGetMusicUrl } from './customSource';
import { providerApi } from './providers';
import { settings, type Quality } from './settings';

export interface DownloadRec {
  key: string;
  song: SongItem;
  path: string;       // file:// 绝对路径;web 服务器缓存模式='server-cache'
  size: number;       // bytes
  quality: Quality;
  at: number;         // downloaded at
  server?: boolean;   // v3.21:web 服务器缓存记录(不占本地 fs,remove 只删记录)
}

const kv = createMMKV({ id: 'nextmusic-downloads' });

function readAll(): DownloadRec[] {
  try { return JSON.parse(kv.getString('items') || '[]'); } catch { return []; }
}
function writeAll(list: DownloadRec[]) { kv.set('items', JSON.stringify(list)); }

export interface DownloadFail { key: string; name: string; err: string; at: number; song?: SongItem } // lx179:song 可选——存了就能重试

const listeners = new Set<() => void>();
function emit() { listeners.forEach(fn => fn()); }

function readFails(): DownloadFail[] {
  try { return JSON.parse(kv.getString('fails') || '[]'); } catch { return []; }
}
function pushFail(f: DownloadFail) {
  const list = [f, ...readFails().filter(x => x.key !== f.key)].slice(0, 50);
  try { kv.set('fails', JSON.stringify(list)); } catch { /* song 对象序列化失败时降级存基本字段 */ kv.set('fails', JSON.stringify(list.map(x => ({ ...x, song: undefined })))); }
}

export function subscribeDownloads(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export const songKey = (s: SongItem) => `${s.source}:${s.songmid}`;

export const downloads = {
  all: readAll,
  isDownloaded(s: SongItem): boolean { return readAll().some(r => r.key === songKey(s)); },
  pathFor(s: SongItem): string | null {
    // v3.29(老板:下载后无法播放):服务器缓存记录 path 是占位符 'server-cache' 不是可播地址——
    // 离线播放只认本地文件(!r.server);服务器缓存命中由 /api/music/url 出流,此处不得劫持播放链
    const r = readAll().find(x => x.key === songKey(s));
    return r && !r.server ? r.path : null;
  },
  totalBytes(): number { return readAll().reduce((n, r) => n + (r.size || 0), 0); },
  remove(s: SongItem) {
    const list = readAll();
    const rec = list.find(r => r.key === songKey(s));
    if (!rec) return;
    writeAll(list.filter(r => r.key !== rec.key));
    if (!rec.server) deleteFile(rec.path); // v3.21:服务器缓存记录不动本地 fs(真删走后台存储管理)
    emit();
  },
  clearAll() {
    const list = readAll();
    writeAll([]);
    list.forEach(r => { if (!r.server) deleteFile(r.path); });
    emit();
  },
};

function localPath(fileUrl: string): string { return fileUrl.replace(/^file:\/\//, ''); }

function extFor(q: Quality): string { return q === 'flac' ? 'flac' : 'mp3'; }
function sanitize(s: string): string { return s.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80); }

// ---------- 取链 ----------
function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(tag + ' 超时')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

async function resolveUrl(song: SongItem, quality: Quality): Promise<{ url: string; headers?: Record<string, string> }> {
  // 听风音乐(RoCeOS):song/{id} 直链(不走 lxserver)
  if (song.source === 'tf') {
    const { tfSongUrl } = await import('./tingfeng');
    const r = await withTimeout(tfSongUrl(song), 25000, '听风取链');
    if (r.url) return { url: r.url };
    throw new Error('听风取链失败');
  }
  // 媒体库源（emby/jellyfin/subsonic/webdav）直接出流地址
  const p = providerApi.streamFor(song);
  if (p) return p;
  // 设备本地文件无需下载
  if (song.source === 'device') throw new Error('本地文件无需下载');
  // 在线音源：自定义脚本优先，其次服务器
  let url: string | null = null;
  try { url = await withTimeout(customGetMusicUrl(song, quality), 20000, '音源取链'); } catch { url = null; }
  if (!url) url = (await withTimeout(api.musicUrl(song, quality), 20000, '服务器取链')).url;
  if (!url) throw new Error('取链失败');
  return { url };
}

// ---------- 队列 ----------
interface Job { song: SongItem; quality: Quality }
const queue: Job[] = [];
let active = 0;
const progressMap = new Map<string, number>(); // key -> 0..1
export function downloadProgress(s: SongItem): number | null {
  const p = progressMap.get(songKey(s));
  return p == null ? null : p;
}

function pump() {
  const max = Math.max(1, Math.min(5, settings.get().maxConcurrent));
  while (active < max && queue.length) {
    const job = queue.shift()!;
    active++;
    runJob(job).catch(e => {
      console.log('[DL] fail:', songKey(job.song), (e as Error).message);
      pushFail({ key: songKey(job.song), name: job.song.name, err: (e as Error).message || '下载失败', at: Date.now(), song: job.song });
    }).finally(() => { active--; emit(); pump(); });
  }
}

export function downloadFails(): DownloadFail[] { return readFails(); }

// lx179(老板 0923 08:48 B):失败重试——带 song 的失败项一键重入队;
// 未带 song 的旧记录(升级前)只能清除;重试成功项从失败列表移除
export function retryFails(): { retried: number } {
  const fails = readFails();
  const retryable = fails.filter(f => f.song && f.song.source && f.song.songmid);
  const rest = fails.filter(f => !(f.song && f.song.source && f.song.songmid));
  kv.set('fails', JSON.stringify(rest));
  if (retryable.length) {
    const isWeb = typeof Platform !== 'undefined' && Platform.OS === 'web' && !/electron/i.test((globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent || '');
    if (isWeb) {
      void webDownloadToServer(retryable.map(f => f.song as SongItem)).catch(() => {});
    } else {
      enqueueDownload(retryable.map(f => f.song as SongItem));
    }
  }
  emit();
  return { retried: retryable.length };
}
export function activeCount(): number { return active; }
export function clearFails() { kv.set('fails', '[]'); emit(); }

async function runJob(job: Job): Promise<void> {
  const key = songKey(job.song);
  progressMap.set(key, 0);
  emit();
  try {
    await withTimeout((async () => {
    // ===== v1.1.7 桌面 web:主进程下载器(Electron net.fetch 落盘 ~/Music/NextMusic 或用户选目录) =====
    if (Platform.OS === 'web') {
      type NmDl = { download?: (o: Record<string, unknown>) => Promise<{ ok: boolean; path?: string; size?: number; error?: string }>; onProgress?: (cb: (p: { key: string; received: number; total: number }) => void) => (() => void) | void };
      const nm = (globalThis as never as Record<string, NmDl>).nmDesktop;
      if (nm?.download) {
        const rU = await resolveUrl(job.song, job.quality);
        const displayName = `${sanitize(job.song.name)}-${sanitize(job.song.singer)}.${extFor(job.quality)}`;
        const dcfg = settings.get();
        const off = nm.onProgress?.(p => { if (p.key === key) { progressMap.set(key, p.total > 0 ? p.received / p.total : 0); emit(); } });
        try {
          const r = await nm.download({ key, url: rU.url, fileName: displayName, saveDir: dcfg.downloadDir === 'custom' ? dcfg.downloadTreeUri || undefined : undefined });
          off?.();
          if (!r.ok || !r.size) throw new Error(r.error || '下载内容为空');
          const list = readAll().filter(rr => rr.key !== key);
          list.unshift({ key, song: job.song, path: 'file://' + r.path, size: r.size, quality: job.quality, at: Date.now() });
          writeAll(list);
        } catch (e2) { off?.(); throw e2; }
        return;
      }
    }
    const dir = `${RNBlobUtil.fs.dirs.DocumentDir}/downloads`;
    await RNBlobUtil.fs.mkdir(dir).catch(() => {});
    const displayName = `${sanitize(job.song.name)}-${sanitize(job.song.singer)}-${String(job.song.songmid ?? '').slice(-24).replace(/[^a-zA-Z0-9_-]/g, '')}.${extFor(job.quality)}`;
    const file = `${dir}/${displayName}`;
    const { url, headers } = await resolveUrl(job.song, job.quality);
    const hdrs = headers && Object.keys(headers).length ? headers : null;
    let size = 0;
    // vc82：公共音乐目录（MediaStore Music/NextMusic，Android 10+）；vc84：custom=用户自选 SAF 目录
    const dcfg = settings.get();
    const wantCustom = dcfg.downloadDir === 'custom' && !!dcfg.downloadTreeUri && !!Downloader?.downloadToTree;
    const wantPublic = !wantCustom && dcfg.downloadDir === 'public' && Number(Platform.Version) >= 29 && !!Downloader?.downloadPublic; // Android 9- 无 MediaStore RELATIVE_PATH,回退私有
    let savedPath = '';
    if (wantCustom) {
      const mime = job.quality === 'flac' ? 'audio/flac' : 'audio/mpeg';
      const r = await new Promise<{ uri: string; size: number }>((resolveP, rejectP) => {
        Downloader!.downloadToTree(key, url, dcfg.downloadTreeUri, displayName, mime, hdrs)
          .then(res => resolveP(res))
          .catch(e => rejectP(e));
      });
      size = r.size;
      savedPath = r.uri;
    } else if (wantPublic) {
      const mime = job.quality === 'flac' ? 'audio/flac' : 'audio/mpeg';
      const r = await new Promise<{ uri: string; size: number }>((resolveP, rejectP) => {
        Downloader!.downloadPublic(key, url, displayName, mime, hdrs)
          .then(res => resolveP(res))
          .catch(e => rejectP(e));
      });
      size = r.size;
      savedPath = r.uri;
    } else if (Downloader) {
      // 原生 OkHttp 流式下载（New Arch 稳定路径）
      await new Promise<void>((resolveP, rejectP) => {
        const sink = (k: string, received: number, total: number) => {
          if (k !== key) return;
          progressMap.set(key, total > 0 ? received / total : 0);
          emit();
        };
        progressSink = sink;
        Downloader.download(key, url, file, hdrs)
          .then(sz => { size = sz; progressSink = null; resolveP(); })
          .catch(e => { progressSink = null; rejectP(e); });
      });
      savedPath = 'file://' + file;
    } else {
      const task = RNBlobUtil.config({ path: file }).fetch('GET', url, headers || {});
      task.progress({ count: 10, interval: 300 }, (w, t) => { progressMap.set(key, t > 0 ? w / t : 0); emit(); });
      const res = await task;
      const status = Number(res.respInfo?.status ?? 200);
      const info = await RNBlobUtil.fs.stat(file);
      size = Number(info.size) || 0;
      if (status >= 400 || size === 0) {
        await RNBlobUtil.fs.unlink(file).catch(() => {});
        throw new Error(`下载失败 HTTP ${status} · ${size}B`);
      }
    }
    if (size === 0) throw new Error('下载内容为空');
    const list = readAll().filter(r => r.key !== key);
    list.unshift({ key, song: job.song, path: savedPath, size, quality: job.quality, at: Date.now() });
    writeAll(list);
    })(), 180000, '下载');
  } finally {
    progressMap.delete(key);
  }
}

// 按歌曲可用音质降级（无损请求但无 flac → 320k → 128k）
function bestQuality(s: SongItem, want: Quality): Quality {
  if (want === 'flac' && !s._types?.flac) return s._types?.['320k'] ? '320k' : '128k';
  if (want === '320k' && !s._types?.['320k'] && s._types && !s._types['320k']) {
    // 在线歌曲无 320k 标记时仍尝试（部分源不回传 types）
    return '320k';
  }
  return want;
}

export function enqueueDownload(songs: SongItem[]): number {
  const exist = new Set(readAll().map(r => r.key));
  let n = 0;
  for (const s of songs) {
    const key = songKey(s);
    if (exist.has(key) || s.source === 'device' || queue.some(j => songKey(j.song) === key)) continue;
    queue.push({ song: s, quality: bestQuality(s, settings.get().downloadQuality) });
    n++;
  }
  pump();
  return n;
}

// ===== web 服务端部署形态(原版对齐): 下载=服务器缓存 =====
// 原版 v2 语义: 歌曲文件缓存到服务器存储(cache/download),再次播放零流量;
// 目录在后台「设置·存储备份」管理(缓存位置 root/data + LRU 配额),不在浏览器选目录
let webDlBusy = false;
export async function webDownloadToServer(songs: SongItem[], quality?: Quality): Promise<{ ok: number; fail: number }> {
  if (webDlBusy) throw new Error('已有下载任务进行中');
  webDlBusy = true;
  let ok = 0, fail = 0;
  try {
    for (const s of songs) {
      if (s.source === 'device') continue;
      // v3.32:默认音质与其他端对齐——按歌曲可用音质降级(原硬编码 320k)
      const q: Quality = quality ?? bestQuality(s, settings.get().downloadQuality);
      // v3.21(老板:playbar 下载不见列表):服务器缓存也写进下载记录(server 标记)——下载管理立即可见,进行中→ok/fail 回写
      const key = songKey(s);
      const recs = readAll();
      if (!recs.some(r => r.key === key)) {
        recs.push({ key, song: s, path: 'server-cache', size: 0, quality: q, at: Date.now(), server: true });
        writeAll(recs); emit();
      }
      try {
        // v3.27(老板:下载403但能播放):服务器 enablePublicRestriction 下公共身份 cache/download 被 403——必须带登录用户身份(x-user-name+x-user-token)
        const authH: Record<string, string> = { 'Content-Type': 'application/json' };
        const st = (await import('./server')).store;
        if (st.username) authH['x-user-name'] = st.username;
        if (st.token) authH['x-user-token'] = st.token;
        // 先取链再缓存(服务端要求 url 一起提交)
        const r = await fetch('/api/music/url', {
          method: 'POST', headers: authH,
          body: JSON.stringify({ songInfo: { source: s.source, songmid: s.songmid, name: s.name, singer: s.singer, hash: s.hash, interval: s.interval }, type: q }),
        }).then(x => x.json());
        if (!r.url) throw new Error('取链失败');
        const cr = await fetch('/api/music/cache/download', {
          method: 'POST', headers: authH,
          body: JSON.stringify({ songInfo: { source: s.source, songmid: s.songmid, name: s.name, singer: s.singer }, url: r.url, quality: q }),
        });
        if (!cr.ok) throw new Error(cr.status === 403 ? '权限限制:请先登录账号' : '缓存写入失败');
        ok++;
      } catch (e) {
        fail++;
        // 失败回滚记录+进失败清单(下载管理可见可重试)
        writeAll(readAll().filter(x => x.key !== key));
        pushFail({ key, name: `${s.name} - ${s.singer}`, err: (e as Error).message.slice(0, 60), at: Date.now(), song: s });
      }
      emit();
    }
  } finally { webDlBusy = false; }
  return { ok, fail };
}
// ===== v3.32(老板 2026-09-18:web 下载缺「本地/服务器」选项) 浏览器本地下载 =====
// 链路:resolveUrl 取链(自定义音源/服务器/媒体库全兼容) → 服务端同源代理
// GET /api/music/download?url=&tag=1&nm_auth=(代理跟随重定向,嵌入封面/歌词元数据,
// Content-Disposition attachment)→ 浏览器落盘到本机下载目录;进度由浏览器下载栏呈现,
// 不写 MMKV 记录(文件在用户磁盘,归浏览器管;重下不拦截)
export async function webDownloadLocal(songs: SongItem[]): Promise<{ ok: number; fail: number }> {
  let ok = 0, fail = 0;
  const st = (await import('./server')).store;
  for (const s of songs) {
    if (s.source === 'device') continue;
    try {
      const q = bestQuality(s, settings.get().downloadQuality);
      const { url } = await resolveUrl(s, q);
      const fn = `${sanitize(s.name)}-${sanitize(s.singer)}.${extFor(q)}`;
      const p = new URLSearchParams({ url, filename: fn, tag: '1', name: s.name, singer: s.singer });
      if (s.albumName) p.set('album', s.albumName);
      if (s.img) p.set('pic', s.img);
      if (st.token) p.set('nm_auth', st.token); // 登录门:/api/music/download 在 NM_MUSIC_AUTH_PATHS,anchor 带不了 header 走 query
      const a = document.createElement('a');
      a.href = `/api/music/download?${p.toString()}`;
      a.download = fn; // 同源:提示文件名(实际以服务端 attachment 为准)
      document.body.appendChild(a); a.click(); a.remove();
      ok++;
      if (songs.length > 1) await new Promise<void>(r2 => setTimeout(r2, 1500)); // 多文件节流:留时间给浏览器登记下载任务
    } catch (e) {
      fail++;
      pushFail({ key: songKey(s), name: `${s.name} - ${s.singer}`, err: ((e as Error).message || '下载失败').slice(0, 60), at: Date.now(), song: s });
    }
  }
  return { ok, fail };
}

export function isWebServerMode(): boolean {
  return typeof navigator !== 'undefined' && typeof window !== 'undefined' && !/electron/i.test(navigator.userAgent) && !!(window as { ReactNativeWebView?: unknown }).ReactNativeWebView === false && 'requestAnimationFrame' in window;
}

export function fmtBytes(n: number): string {
  if (n >= 1 << 30) return (n / (1 << 30)).toFixed(2) + ' GB';
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MB';
  if (n >= 1 << 10) return (n / (1 << 10)).toFixed(0) + ' KB';
  return n + ' B';
}
