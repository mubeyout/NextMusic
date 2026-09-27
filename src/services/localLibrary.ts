// localLibrary.ts —— 本机曲库 Provider(模块②,LEO v2.1 §② + v3 A1-A6)
// 职责:配置持久化 / 目录拾取(Android SAF·Web FSAPI·桌面 nmDesktop 接入口) / 首扫+增量重扫(mtime) /
//       识别链(MediaStore 标签匹配 | FSAPI 字节级标签解析 → 文件名启发式 → 未分类) / hash 去重 /
//       三视图(歌手/专辑/文件夹) / 失效检测 / 播放 SongItem 化(source='device' 复用本机播放路径)
// 平台矩阵:Android=SAF 授权持久 + MediaStore 元数据;Web=FSAPI 句柄 + IndexedDB(File 可结构化克隆);
//         桌面 Electron=目录选择经 nmDesktop IPC 留接入口(扫描 stub,见 scanLocalLibrary desktop 分支)。
import { Platform, NativeModules } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import saf from 'react-native-saf-x';
import type { SongItem } from './server';
import { readAudioTags } from './audiotags';

// 原生 MediaStore 扫描模块(标签真源:Android 已解析 ID3/Vorbis/FLAC)——与 devicelibrary 同款
const MusicScanner = NativeModules.MusicScanner as { scan(): Promise<{ uri: string; name: string; singer: string; album: string; durationMs: number; size: number; mtime: number; path: string }[]> } | undefined;

const IS_WEB = Platform.OS === 'web';
const IS_ANDROID = Platform.OS === 'android';

const kv = createMMKV({ id: 'nextmusic-local-libs' });
const K_CONFIGS = 'configs';
const K_TRACKS = (id: string) => `tracks:${id}`;

export const ALL_FORMATS = ['flac', 'mp3', 'wav', 'ape', 'ogg', 'm4a'] as const;
export type LocalFormat = typeof ALL_FORMATS[number];
export const DEFAULT_LIB_NAME = '我的本机曲库';

export interface LocalLibConfig {
  id: string;
  name: string;
  platform: 'saf' | 'fsapi' | 'desktop';
  rootUri: string;      // SAF tree uri / 桌面路径;fsapi 存 IDB 句柄此处留空
  rootLabel: string;    // 展示行(如 /storage/701D-2A0E/Music)
  formats: string[];
  scanSubdirs: boolean;
  filterShort: boolean;
  createdAt: number;
  lastScanAt?: number;
  trackCount: number;
}

export type TagSource = 'tag' | 'filename' | 'none';

export interface LocalTrack {
  id: string;          // relPath 稳定 hash
  relPath: string;     // 库根内相对路径('/' 连接)
  uri: string;         // 播放地址:android=content:// uri;web 现取 File 生成 blob:
  name: string;
  singer: string;      // 识别链终点失败 → '未分类'
  album: string;       // 空串=无标签(专辑视图按目录分组)
  durationSec: number; // 0=未知(不过滤)
  size: number;
  mtime: number;
  ext: string;
  tagSource: TagSource;
  hash: string;        // 去重指纹(同目录树内)
  addedAt: number;
}

export interface ScanProgress {
  found: number;
  recognized: number;
  phase: 'full' | 'delta';
  added?: number;
  removed?: number;
}
export interface ScanSummary {
  kept: number;
  dups: number;
  filteredShort: number;
  cancelled: boolean;
  added: number;
  removed: number;
  changed: number;
}
export interface CancelToken { cancelled: boolean }

// ---------- 配置存取 ----------
function readConfigs(): LocalLibConfig[] {
  try { return JSON.parse(kv.getString(K_CONFIGS) || '[]'); } catch { return []; }
}
function writeConfigs(list: LocalLibConfig[]): void { kv.set(K_CONFIGS, JSON.stringify(list)); }
function readTracks(id: string): LocalTrack[] {
  try { return JSON.parse(kv.getString(K_TRACKS(id)) || '[]'); } catch { return []; }
}
function writeTracks(id: string, list: LocalTrack[]): void { kv.set(K_TRACKS(id), JSON.stringify(list)); }

export const localLib = {
  all(): LocalLibConfig[] { return readConfigs(); },
  get(id: string): LocalLibConfig | undefined { return readConfigs().find(c => c.id === id); },
  save(cfg: LocalLibConfig): void {
    const list = readConfigs();
    const i = list.findIndex(c => c.id === cfg.id);
    if (i >= 0) list[i] = cfg; else list.push(cfg);
    writeConfigs(list);
  },
  remove(id: string): void {
    writeConfigs(readConfigs().filter(c => c.id !== id));
    kv.remove(K_TRACKS(id));
    if (IS_WEB) void idbPurge(id);
  },
  tracks(id: string): LocalTrack[] { return readTracks(id); },
  newDraft(name?: string): LocalLibConfig {
    return {
      id: `loc-${Date.now().toString(36)}`, name: name || DEFAULT_LIB_NAME,
      platform: IS_ANDROID ? 'saf' : 'fsapi', rootUri: '', rootLabel: '',
      formats: [...ALL_FORMATS], scanSubdirs: true, filterShort: true,
      createdAt: Date.now(), trackCount: 0,
    };
  },
};

// ---------- Web IndexedDB(目录句柄 + File 对象;结构化克隆原生支持) ----------
interface DirHandleLike {
  name: string;
  queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
  entries?: () => AsyncIterable<[string, unknown]>;
  getFileHandle?: (n: string) => Promise<FileHandleLike>;
}
interface FileHandleLike { getFile: () => Promise<File> }

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('no-idb')); return; }
    const r = indexedDB.open('nm-local-libs', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('handles'); r.result.createObjectStore('files'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('idb-open'));
  });
}
function idbTx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return idb().then(db => new Promise<T>((res, rej) => {
    const tx = db.transaction(store, mode);
    const rq = fn(tx.objectStore(store));
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error || new Error('idb-tx'));
    tx.oncomplete = () => db.close();
  }));
}
const idbPutHandle = (libId: string, h: DirHandleLike) => idbTx('handles', 'readwrite', s => s.put(h, libId)).catch(() => {});
const idbGetHandle = (libId: string) => idbTx<DirHandleLike | undefined>('handles', 'readonly', s => s.get(libId) as IDBRequest<DirHandleLike | undefined>).catch(() => undefined);
const idbPutFile = (libId: string, relPath: string, f: File) => idbTx('files', 'readwrite', s => s.put(f, `${libId}/${relPath}`)).catch(() => {});
const idbGetFile = (libId: string, relPath: string) => idbTx<File | undefined>('files', 'readonly', s => s.get(`${libId}/${relPath}`) as IDBRequest<File | undefined>).catch(() => undefined);
const idbDelFile = (libId: string, relPath: string) => idbTx('files', 'readwrite', s => s.delete(`${libId}/${relPath}`)).catch(() => {});
async function idbPurge(libId: string): Promise<void> {
  try {
    await idbTx('handles', 'readwrite', s => s.delete(libId));
  } catch { /* ignore */ }
}

// ---------- 目录拾取 ----------
export interface PickedRoot { platform: LocalLibConfig['platform']; rootUri: string; rootLabel: string; handle?: unknown }

/** SAF tree uri → 展示路径(尽量还原 /storage/xxxx/Label 形态) */
function safUriLabel(uri: string): string {
  try {
    const u = new URL(uri);
    const doc = decodeURIComponent(u.pathname);
    const segs = doc.split(':').pop()?.split('/').filter(Boolean) || [];
    return segs.length ? `/${segs.join('/')}` : u.host || uri;
  } catch { return uri; }
}

export async function pickDirectory(): Promise<PickedRoot | null> {
  // ① Web FSAPI(浏览器手机/桌面 Chrome):原生提示,不加自定义层(v3 A1)
  const sdp = (globalThis as unknown as { showDirectoryPicker?: (o?: { mode?: string; id?: string }) => Promise<DirHandleLike> }).showDirectoryPicker;
  if (IS_WEB && typeof sdp === 'function') {
    const h = await sdp({ mode: 'read', id: 'nm-local-lib' });
    if (!h) return null;
    return { platform: 'fsapi', rootUri: '', rootLabel: h.name || '本机目录', handle: h };
  }
  // ② Android SAF:openDocumentTree(true)=持久授权(v3 A1「永久授权」提示对应)
  // ③ 桌面 Electron:web 无 FSAPI 时落到 saf-x shim → nmDesktop.pickDir 原生对话框(接入口)
  const picked = await saf.openDocumentTree(true as never);
  if (!picked || !picked.uri) return null;
  const label = safUriLabel(picked.uri);
  const isDesktop = IS_WEB; // shim 形态的桌面端(原生壳)
  return { platform: isDesktop ? 'desktop' : 'saf', rootUri: picked.uri, rootLabel: label || '所选目录' };
}

/** fsapi:拾取到的目录句柄落 IDB(下次会话 queryPermission 免重授);可复用已拾取句柄避免二次弹窗 */
export async function bindFsapiHandle(libId: string, handle?: unknown): Promise<boolean> {
  let h = handle as DirHandleLike | undefined;
  if (!h) {
    const sdp = (globalThis as unknown as { showDirectoryPicker?: (o?: { mode?: string; id?: string }) => Promise<DirHandleLike> }).showDirectoryPicker;
    if (!IS_WEB || typeof sdp !== 'function') return false;
    h = await sdp({ mode: 'read', id: 'nm-local-lib' });
  }
  if (!h) return false;
  await idbPutHandle(libId, h);
  return true;
}

// ---------- 失效检测(v3 A5) ----------
const availCache = new Map<string, { ok: boolean; at: number }>();
export async function checkLocalLib(cfg: LocalLibConfig, force = false): Promise<boolean> {
  const hit = availCache.get(cfg.id);
  if (!force && hit && Date.now() - hit.at < 8000) return hit.ok;
  let ok = false;
  try {
    if (cfg.platform === 'saf') {
      await saf.listFiles(cfg.rootUri); // 树根可达=可用(SD 拔出会抛)
      ok = true;
    } else if (cfg.platform === 'fsapi') {
      const h = await idbGetHandle(cfg.id);
      ok = !!h && (h.queryPermission ? await h.queryPermission({ mode: 'read' }) === 'granted' : false);
    } else {
      ok = true; // desktop stub:无 fs 桥,不误报
    }
  } catch { ok = false; }
  availCache.set(cfg.id, { ok, at: Date.now() });
  return ok;
}

/** fsapi 重新授权(需在用户手势内调用) */
export async function reauthorizeLocalLib(cfg: LocalLibConfig): Promise<boolean> {
  if (cfg.platform !== 'fsapi') return false;
  const h = await idbGetHandle(cfg.id);
  if (!h || !h.requestPermission) return false;
  return await h.requestPermission({ mode: 'read' }) === 'granted';
}

// ---------- 识别链(v3 A3) ----------
/** 文件名启发式:「歌手 - 标题」约定(与 devicelibrary.parseName 同语义) */
function parseFileName(fileName: string): { singer: string; name: string } | null {
  const stem = fileName.replace(/\.[^.]+$/, '');
  const m = stem.split(/\s+-\s+|\s-\s/);
  if (m.length >= 2 && m[0].trim() && m.slice(1).join(' - ').trim()) {
    return { singer: m[0].trim(), name: m.slice(1).join(' - ').trim() };
  }
  return null;
}

function fmtInterval(sec: number): string {
  if (!sec) return '';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
}

function trackId(relPath: string): string {
  let h = 5381;
  for (let i = 0; i < relPath.length; i++) h = ((h << 5) + h + relPath.charCodeAt(i)) | 0;
  return 'lt_' + Math.abs(h).toString(36);
}

// FNV-1a 指纹(web 真内容 hash:头 64KB+尾 64KB+size;android 无切片读,退 size+时长+规范名)
function fnv(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
async function webFingerprint(file: File): Promise<string> {
  const HEAD = 65536;
  const head = new Uint8Array(await file.slice(0, Math.min(HEAD, file.size)).arrayBuffer());
  const h2 = fnv(head);
  let h3 = 0;
  if (file.size > HEAD * 3) {
    const tail = new Uint8Array(await file.slice(file.size - HEAD, file.size).arrayBuffer());
    h3 = fnv(tail);
  }
  return `w:${h2}:${h3}:${file.size}`;
}
function androidFingerprint(size: number, durationMs: number, name: string): string {
  return `a:${size}:${durationMs}:${name.trim().toLowerCase()}`;
}

/** Android MediaStore 标签索引(真 ID3/Vorbis/FLAC 元数据,按 文件名+大小 匹配 SAF 树内文件) */
let msIndex: Promise<Map<string, { title: string; singer: string; album: string; durationMs: number }>> | null = null;
function mediaStoreIndex(): Promise<Map<string, { title: string; singer: string; album: string; durationMs: number }>> {
  if (!msIndex) {
    msIndex = (async () => {
      const m = new Map<string, { title: string; singer: string; album: string; durationMs: number }>();
      if (!IS_ANDROID || !MusicScanner) return m;
      try {
        const rows = await MusicScanner.scan();
        for (const r of rows) {
          const base = (r.path || r.uri).split('/').pop() || r.name;
          m.set(`${base.toLowerCase()}:${r.size}`, { title: r.name || base, singer: r.singer || '', album: r.album || '', durationMs: r.durationMs || 0 });
        }
      } catch { /* MediaStore 不可用 → 走启发式 */ }
      return m;
    })();
  }
  return msIndex;
}

// ---------- 目录遍历 ----------
interface RawFile { relPath: string; uri: string; name: string; size: number; mtime: number }
interface RawDir { name: string; relPath: string }

async function walkSaf(rootUri: string, scanSubdirs: boolean, exts: Set<string>, onFound: (n: number) => void, token: CancelToken): Promise<{ files: RawFile[] }> {
  const files: RawFile[] = [];
  const AUDIO = new RegExp(`\\.(${[...exts].join('|')})$`, 'i');
  async function walk(uri: string, prefix: string, depth: number): Promise<void> {
    if (token.cancelled || depth > 8) return;
    let items: { uri: string; name: string; type: string; size?: number; lastModified?: number }[] = [];
    try { items = (await saf.listFiles(uri)) as typeof items; } catch { return; } // 子目录不可读=跳过
    for (const it of items) {
      if (token.cancelled) return;
      if (it.type === 'directory') {
        if (scanSubdirs) await walk(it.uri, prefix ? `${prefix}/${it.name}` : it.name, depth + 1);
      } else if (AUDIO.test(it.name)) {
        files.push({ relPath: prefix ? `${prefix}/${it.name}` : it.name, uri: it.uri, name: it.name, size: it.size || 0, mtime: it.lastModified || 0 });
        onFound(files.length);
      }
    }
  }
  await walk(rootUri, '', 0);
  return { files };
}

async function walkFsapi(handle: DirHandleLike, scanSubdirs: boolean, exts: Set<string>, onFound: (n: number) => void, token: CancelToken): Promise<{ files: (RawFile & { file: File })[] }> {
  const files: (RawFile & { file: File })[] = [];
  const AUDIO = new RegExp(`\\.(${[...exts].join('|')})$`, 'i');
  async function walk(dir: DirHandleLike, prefix: string, depth: number): Promise<void> {
    if (token.cancelled || depth > 8 || !dir.entries) return;
    try {
      for await (const [name, h] of dir.entries()) {
        if (token.cancelled) return;
        const fh = h as FileHandleLike;
        const dh = h as DirHandleLike;
        if (typeof fh.getFile === 'function') {
          if (!AUDIO.test(name)) continue;
          const file = await fh.getFile();
          files.push({ relPath: prefix ? `${prefix}/${name}` : name, uri: '', name, size: file.size, mtime: file.lastModified || 0, file });
          onFound(files.length);
        } else if (scanSubdirs && typeof dh.entries === 'function') {
          await walk(dh, prefix ? `${prefix}/${name}` : name, depth + 1);
        }
      }
    } catch { /* 目录不可读=跳过 */ }
  }
  await walk(handle, '', 0);
  return { files };
}

// ---------- 识别(resolve 单文件元数据) ----------
interface Resolved extends LocalTrack { _rawMtime: number }

async function resolveAndroid(raw: RawFile, ext: string, ms: Map<string, { title: string; singer: string; album: string; durationMs: number }>): Promise<Resolved> {
  let name = raw.name.replace(/\.[^.]+$/, '');
  let singer = '';
  let album = '';
  let durationSec = 0;
  let tagSource: TagSource = 'none';
  let hash = androidFingerprint(raw.size, 0, raw.name);
  const hit = ms.get(`${raw.name.toLowerCase()}:${raw.size}`);
  if (hit && (hit.title || hit.singer)) {
    // ① 标签链(MediaStore 已解析 ID3/Vorbis/FLAC)
    name = hit.title || name;
    singer = hit.singer || '';
    album = hit.album || '';
    durationSec = hit.durationMs ? hit.durationMs / 1000 : 0;
    tagSource = 'tag';
    hash = androidFingerprint(raw.size, hit.durationMs, hit.title);
  } else {
    const fn = parseFileName(raw.name);
    if (fn) {
      // ② 文件名启发式
      singer = fn.singer; name = fn.name; tagSource = 'filename';
    }
    // ③ 未分类:singer 空,浏览层归「未分类」分组(不丢)
  }
  return {
    id: trackId(raw.relPath), relPath: raw.relPath, uri: raw.uri,
    name, singer, album, durationSec, size: raw.size, mtime: raw.mtime, ext,
    tagSource, hash, addedAt: Date.now(), _rawMtime: raw.mtime,
  };
}

async function resolveWeb(raw: RawFile & { file: File }, ext: string): Promise<Resolved> {
  let name = raw.name.replace(/\.[^.]+$/, '');
  let singer = '';
  let album = '';
  let durationSec = 0;
  let tagSource: TagSource = 'none';
  const tags = await readAudioTags(ext, async (s, l) => new Uint8Array(await raw.file.slice(s, s + l).arrayBuffer()), raw.file.size);
  if (tags.title || tags.artist || tags.album) {
    // ① 标签链(字节级 ID3/Vorbis/FLAC/MP4 解析)
    name = tags.title || name;
    singer = tags.artist || '';
    album = tags.album || '';
    durationSec = tags.durationSec || 0;
    tagSource = 'tag';
  } else {
    const fn = parseFileName(raw.name);
    if (fn) {
      // ② 文件名启发式
      singer = fn.singer; name = fn.name; tagSource = 'filename';
    }
    if (tags.durationSec) durationSec = tags.durationSec; // 无标签但有时长(如 WAV)
  }
  const hash = await webFingerprint(raw.file);
  return {
    id: trackId(raw.relPath), relPath: raw.relPath, uri: '',
    name, singer, album, durationSec, size: raw.size, mtime: raw.mtime, ext,
    tagSource, hash, addedAt: Date.now(), _rawMtime: raw.mtime,
  };
}

// ---------- 首扫 / 增量重扫 ----------
const SHORT_SEC = 30;

async function scanCore(cfg: LocalLibConfig, delta: boolean, cb: (p: ScanProgress) => void, token: CancelToken): Promise<ScanSummary> {
  const exts = new Set(cfg.formats);
  const throttle = { at: 0 };
  const emit = (p: ScanProgress) => {
    const now = Date.now();
    if (now - throttle.at > 60 || token.cancelled) { throttle.at = now; cb(p); }
  };
  const summary: ScanSummary = { kept: 0, dups: 0, filteredShort: 0, cancelled: false, added: 0, removed: 0, changed: 0 };
  const known = new Map(readTracks(cfg.id).map(t => [t.relPath, t]));
  const seenHash = new Set<string>(delta ? [...known.values()].map(t => t.hash) : []);

  const finish = (list: LocalTrack[], msDelta: { added: number; removed: number; changed: number }): ScanSummary => {
    list.sort((a, b) => a.relPath.localeCompare(b.relPath));
    writeTracks(cfg.id, list);
    localLib.save({ ...cfg, trackCount: list.length, lastScanAt: Date.now() });
    summary.kept = list.length;
    summary.added = msDelta.added; summary.removed = msDelta.removed; summary.changed = msDelta.changed;
    return summary;
  };

  if (cfg.platform === 'desktop') {
    // 桌面接入口:目录可选中,fs 遍历桥待原生模块(留 stub,不误报数据)
    throw new Error('桌面端目录扫描即将接入：当前版本请在手机或浏览器端完成首扫');
  }

  let out: LocalTrack[] = [];
  const dropped = new Set<string>(); // 本轮发现且保留的 relPath(增量判定消失用)

  if (cfg.platform === 'saf') {
    const ms = await mediaStoreIndex();
    const { files } = await walkSaf(cfg.rootUri, cfg.scanSubdirs, exts, n => emit({ found: n, recognized: summary.kept + summary.dups + summary.filteredShort, phase: delta ? 'delta' : 'full' }), token);
    out = delta ? [...known.values()] : [];
    for (const raw of files) {
      if (token.cancelled) break;
      dropped.add(raw.relPath);
      const prev = known.get(raw.relPath);
      if (delta && prev && prev.mtime === raw.mtime && prev.size === raw.size) continue; // mtime 未变=直留(v3 A6)
      if (delta && prev) summary.changed++;
      const t = await resolveAndroid(raw, (raw.name.split('.').pop() || '').toLowerCase(), ms);
      if (cfg.filterShort && t.durationSec > 0 && t.durationSec < SHORT_SEC) { summary.filteredShort++; continue; }
      if (seenHash.has(t.hash)) { summary.dups++; continue; } // 同目录树内容去重(v3 A4)
      seenHash.add(t.hash);
      if (delta && prev) { const i = out.findIndex(x => x.relPath === prev.relPath); if (i >= 0) out[i] = t; else out.push(t); }
      else out.push(t);
      emit({ found: files.length, recognized: out.length, phase: delta ? 'delta' : 'full' });
    }
  } else if (cfg.platform === 'fsapi') {
    const handle = await idbGetHandle(cfg.id);
    if (!handle) throw new Error('目录授权已失效，请重新选择目录');
    const { files } = await walkFsapi(handle, cfg.scanSubdirs, exts, n => emit({ found: n, recognized: summary.kept + summary.dups + summary.filteredShort, phase: delta ? 'delta' : 'full' }), token);
    out = delta ? [...known.values()] : [];
    for (const raw of files) {
      if (token.cancelled) break;
      dropped.add(raw.relPath);
      const prev = known.get(raw.relPath);
      if (delta && prev && prev.mtime === raw.mtime && prev.size === raw.size) { await idbPutFile(cfg.id, raw.relPath, raw.file); continue; }
      if (delta && prev) summary.changed++;
      const t = await resolveWeb(raw, (raw.name.split('.').pop() || '').toLowerCase());
      if (cfg.filterShort && t.durationSec > 0 && t.durationSec < SHORT_SEC) { summary.filteredShort++; continue; }
      if (seenHash.has(t.hash)) { summary.dups++; continue; }
      seenHash.add(t.hash);
      await idbPutFile(cfg.id, raw.relPath, raw.file);
      if (delta && prev) { const i = out.findIndex(x => x.relPath === prev.relPath); if (i >= 0) out[i] = t; else out.push(t); }
      else out.push(t);
      emit({ found: files.length, recognized: out.length, phase: delta ? 'delta' : 'full' });
    }
  } else {
    throw new Error('不支持的目录来源');
  }

  if (token.cancelled) summary.cancelled = true;
  // 增量:消失的文件移除(全扫取消时也按已发现集收口,防陈旧残留)
  if (delta) {
    let removed = 0;
    out = out.filter(t => {
      const wasKnown = known.has(t.relPath);
      const gone = wasKnown && !dropped.has(t.relPath);
      if (gone) { removed++; if (IS_WEB) void idbDelFile(cfg.id, t.relPath); }
      return !gone;
    });
    summary.removed = removed;
    summary.added = out.filter(t => !known.has(t.relPath)).length;
  } else if (summary.cancelled) {
    out = out.filter(t => dropped.has(t.relPath)); // 只保留本轮真正看到的
  }
  return finish(out, { added: summary.added, removed: summary.removed, changed: summary.changed });
}

export function scanLocalLibrary(cfg: LocalLibConfig, cb: (p: ScanProgress) => void, token: CancelToken): Promise<ScanSummary> {
  return scanCore(cfg, false, cb, token);
}
export function rescanLocalLibrary(cfg: LocalLibConfig, cb: (p: ScanProgress) => void, token: CancelToken): Promise<ScanSummary> {
  return scanCore(cfg, true, cb, token);
}

// ---------- 三视图(歌手/专辑/文件夹) ----------
export const UNKNOWN_ARTIST = '未分类';

const normArtist = (s: string) => String(s || '').trim();
const artistKeyOf = (s: string) => {
  const first = String(s || '').split(/[/、,;&+]/)[0].trim();
  return first || UNKNOWN_ARTIST;
};

export interface LocalArtist { key: string; name: string; songCount: number; albumCount: number }
export interface LocalAlbum { key: string; name: string; artist: string; byDir: boolean; songCount: number; dirPath: string }

export function localArtists(libId: string): LocalArtist[] {
  const tracks = readTracks(libId);
  const map = new Map<string, LocalArtist & { dirs: Set<string> }>();
  for (const t of tracks) {
    const key = t.singer ? artistKeyOf(t.singer) : UNKNOWN_ARTIST;
    let a = map.get(key);
    if (!a) { a = { key, name: key, songCount: 0, albumCount: 0, dirs: new Set() }; map.set(key, a); }
    a.songCount++;
    a.dirs.add(t.album ? 'tag:' + t.album.toLowerCase() : 'dir:' + dirOf(t.relPath));
  }
  return Array.from(map.values())
    .map(({ dirs, ...a }) => ({ ...a, albumCount: dirs.size }))
    .sort((a, b) => (b.songCount - a.songCount) || a.name.localeCompare(b.name, 'zh'));
}

function dirOf(relPath: string): string {
  const i = relPath.lastIndexOf('/');
  return i > 0 ? relPath.slice(0, i) : '';
}

export function localAlbums(libId: string): LocalAlbum[] {
  const tracks = readTracks(libId);
  const map = new Map<string, LocalAlbum>();
  for (const t of tracks) {
    const tag = t.album.trim();
    const dirPath = dirOf(t.relPath);
    const key = tag ? 'tag:' + tag.toLowerCase() : 'dir:' + dirPath;
    let al = map.get(key);
    if (!al) {
      al = tag
        ? { key, name: tag, artist: '', byDir: false, songCount: 0, dirPath }
        : { key, name: dirPath ? dirPath.split('/').pop() || '本机音乐' : '本机音乐', artist: '', byDir: true, songCount: 0, dirPath };
      map.set(key, al);
    }
    al.songCount++;
    const ar = t.singer ? artistKeyOf(t.singer) : UNKNOWN_ARTIST;
    if (al.artist && al.artist !== ar) al.artist = '多艺人';
    else if (!al.artist) al.artist = ar;
  }
  return Array.from(map.values()).sort((a, b) => b.songCount - a.songCount);
}

export function localSingerTracks(libId: string, key: string): LocalTrack[] {
  return readTracks(libId).filter(t => (t.singer ? artistKeyOf(t.singer) : UNKNOWN_ARTIST) === key);
}
export function localAlbumTracks(libId: string, key: string): LocalTrack[] {
  const al = localAlbums(libId).find(a => a.key === key);
  if (!al) return [];
  return readTracks(libId).filter(t => {
    const tag = t.album.trim();
    return tag ? 'tag:' + tag.toLowerCase() === key : 'dir:' + dirOf(t.relPath) === key;
  });
}

// 文件夹视图:原目录树 + 「未分类」独立分组(v3 A3:icon file-question,置顶)
export interface FolderView {
  dirs: { name: string; path: string; count: number }[];
  songs: LocalTrack[];
  unknown: LocalTrack[]; // 未分类(tagSource=none)——根级独立分组
  totalCount: number;
}
export function localFolderView(libId: string, dirPath: string): FolderView {
  const tracks = readTracks(libId);
  const dirSet = new Map<string, number>();
  const songs: LocalTrack[] = [];
  const prefix = dirPath ? dirPath + '/' : '';
  for (const t of tracks) {
    if (!t.relPath.startsWith(prefix)) continue;
    const rest = t.relPath.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash > 0) {
      const d = rest.slice(0, slash);
      dirSet.set(d, (dirSet.get(d) || 0) + 1);
    } else {
      songs.push(t);
    }
  }
  const dirs = Array.from(dirSet.entries())
    .map(([name, count]) => ({ name, path: prefix + name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const unknown = dirPath === '' ? songs.filter(t => t.tagSource === 'none') : [];
  const unknownIds = new Set(unknown.map(t => t.id));
  return {
    dirs, songs: songs.filter(t => !unknownIds.has(t.id)), unknown,
    totalCount: tracks.length,
  };
}

// ---------- 播放(与其他源同构:source='device' 复用本机播放路径) ----------
export async function toPlayable(tracks: LocalTrack[], libId: string): Promise<SongItem[]> {
  const out: SongItem[] = [];
  for (const t of tracks) {
    let uri = t.uri;
    if (!uri && IS_WEB) {
      const f = await idbGetFile(libId, t.relPath);
      if (f) uri = URL.createObjectURL(f);
    }
    if (!uri) continue;
    out.push({
      name: t.name, singer: t.singer || UNKNOWN_ARTIST, source: 'device', songmid: uri,
      albumId: '', interval: fmtInterval(t.durationSec), hash: t.id,
      albumName: t.album || undefined,
    });
  }
  return out;
}
