// 设备本地音乐扫描：
// ① 直接路径模式（旧 Android 或已授予原始读权限）
// ② SAF 模式（Android 10+ scoped storage 主路径）：系统文件夹选择器授权 → listFiles 递归
// 结果持久化 MMKV；SongItem.songmid = 文件绝对路径或 content:// uri（ExoPlayer 均可播）
import { PermissionsAndroid, Platform } from 'react-native';
import RNBlobUtil from 'react-native-blob-util';
import saf from 'react-native-saf-x';
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from './server';

const kv = createMMKV({ id: 'nextmusic-device-music' });

export interface DeviceTrack {
  path: string;      // 绝对路径或 content:// uri
  name: string;
  singer: string;
  size: number;
  mtime: number;
}

const AUDIO_RE = /\.(mp3|flac|m4a|aac|ogg|wav|ape|wma|opus)$/i;
const SCAN_ROOTS = [
  '/storage/emulated/0/Music',
  '/storage/emulated/0/Download',
];
const SAF_TREE_KEY = 'saf-tree';

function readAll(): DeviceTrack[] {
  try { return JSON.parse(kv.getString('tracks') || '[]'); } catch { return []; }
}
function writeAll(list: DeviceTrack[]) { kv.set('tracks', JSON.stringify(list)); }

function parseName(fileName: string): { name: string; singer: string } {
  const stem = fileName.replace(AUDIO_RE, '');
  const dash = stem.split(/\s+-\s+|\s-\s/); // "歌手 - 歌名" 约定
  if (dash.length >= 2) return { singer: dash[0].trim(), name: dash.slice(1).join(' - ').trim() };
  return { singer: '本地音乐', name: stem };
}

export function getSafTree(): string | null { return kv.getString(SAF_TREE_KEY) || null; }
export function setSafTree(uri: string | null) {
  if (uri) kv.set(SAF_TREE_KEY, uri); else kv.remove(SAF_TREE_KEY);
}

export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const apiLevel = Platform.Version;
  const perm = apiLevel >= 33 ? 'android.permission.READ_MEDIA_AUDIO' : 'android.permission.READ_EXTERNAL_STORAGE';
  try {
    if (await PermissionsAndroid.check(perm)) return true;
    const r = await PermissionsAndroid.request(perm, {
      title: '访问本地音乐',
      message: '用于扫描设备上的音乐文件并添加到播放列表',
      buttonPositive: '允许',
      buttonNegative: '拒绝',
    });
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch { return false; }
}

// ---------- 直接路径模式 ----------
async function walk(dir: string, depth: number, out: DeviceTrack[]): Promise<boolean> {
  if (depth > 4) return true;
  let entries: string[] = [];
  try { entries = await RNBlobUtil.fs.ls(dir); } catch { return false; } // 目录不可读
  for (const e of entries) {
    const full = `${dir}/${e}`;
    let stat: { type?: string; size?: number; lastModified?: number };
    try { stat = await RNBlobUtil.fs.stat(full); } catch { continue; }
    if (stat.type === 'directory') await walk(full, depth + 1, out);
    else if (AUDIO_RE.test(e)) {
      const { name, singer } = parseName(e);
      out.push({ path: full, name, singer, size: stat.size || 0, mtime: stat.lastModified || 0 });
    }
  }
  return true;
}

// ---------- SAF 模式 ----------
async function walkSaf(uri: string, depth: number, out: DeviceTrack[], onProgress?: (n: number) => void): Promise<void> {
  if (depth > 5) return;
  let items: { uri: string; name: string; type: string; size?: number; lastModified?: number }[] = [];
  try { items = await saf.listFiles(uri) as typeof items; } catch { return; }
  for (const it of items) {
    if (it.type === 'directory') await walkSaf(it.uri, depth + 1, out, onProgress);
    else if (AUDIO_RE.test(it.name)) {
      const { name, singer } = parseName(it.name);
      out.push({ path: it.uri, name, singer, size: it.size || 0, mtime: it.lastModified || 0 });
      onProgress?.(out.length);
    }
  }
}

export interface ScanResult { count: number; ms: number; mode: 'path' | 'saf' }

/** 直接路径扫描（可能因 scoped storage 返回 0） */
export async function scanByPath(onProgress?: (n: number) => void): Promise<ScanResult> {
  const t0 = Date.now();
  const out: DeviceTrack[] = [];
  let anyOk = false;
  for (const root of SCAN_ROOTS) {
    anyOk = (await walk(root, 0, out)) || anyOk;
    onProgress?.(out.length);
  }
  if (anyOk && out.length) return finish(out, t0, 'path');
  return { count: 0, ms: Date.now() - t0, mode: 'path' };
}

/** SAF：打开系统目录选择器（用户选 Music 文件夹），授权后扫描并记住授权 */
export async function scanBySafFolder(onProgress?: (n: number) => void): Promise<ScanResult | null> {
  const picked = await saf.openDocumentTree(true);
  if (!picked || !picked.uri) return null; // 用户取消
  setSafTree(picked.uri);
  return scanSafTree(picked.uri, onProgress);
}

/** 用已记住的 SAF 授权目录重扫 */
export async function scanSafTree(treeUri: string, onProgress?: (n: number) => void): Promise<ScanResult> {
  const t0 = Date.now();
  const out: DeviceTrack[] = [];
  await walkSaf(treeUri, 0, out, onProgress);
  return finish(out, t0, 'saf');
}

function finish(list: DeviceTrack[], t0: number, mode: 'path' | 'saf'): ScanResult {
  const seen = new Set<string>();
  const unique = list.filter(t => { if (seen.has(t.path)) return false; seen.add(t.path); return true; });
  unique.sort((a, b) => b.mtime - a.mtime);
  writeAll(unique);
  return { count: unique.length, ms: Date.now() - t0, mode };
}

export function deviceSongs(): SongItem[] {
  return readAll().map(t => ({
    name: t.name,
    singer: t.singer,
    source: 'device',
    songmid: t.path,
    albumId: '',
    interval: '',
    hash: t.path,
  }));
}

export function deviceTrackCount(): number { return readAll().length; }

export function removeDeviceTrack(path: string) {
  writeAll(readAll().filter(t => t.path !== path));
}
