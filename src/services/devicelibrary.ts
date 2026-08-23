// 设备本地音乐扫描：权限申请 → 递归扫描公共音乐目录 → 元数据从文件名解析 → MMKV 持久化
import { PermissionsAndroid, Platform } from 'react-native';
import RNBlobUtil from 'react-native-blob-util';
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from './server';

const kv = createMMKV({ id: 'nextmusic-device-music' });

export interface DeviceTrack {
  path: string;      // 绝对路径（file:// 播放用）
  name: string;
  singer: string;
  size: number;
  mtime: number;
}

const AUDIO_RE = /\.(mp3|flac|m4a|aac|ogg|wav|ape|wma|opus)$/i;
const SCAN_ROOTS = [
  '/storage/emulated/0/Music',
  '/storage/emulated/0/Download',
  '/storage/emulated/0/Recordings',
];

function readAll(): DeviceTrack[] {
  try { return JSON.parse(kv.getString('tracks') || '[]'); } catch { return []; }
}
function writeAll(list: DeviceTrack[]) { kv.set('tracks', JSON.stringify(list)); }

export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const apiLevel = Platform.Version;
  const perm = apiLevel >= 33 ? 'android.permission.READ_MEDIA_AUDIO' : 'android.permission.READ_EXTERNAL_STORAGE';
  const has = await PermissionsAndroid.check(perm);
  if (has) return true;
  const r = await PermissionsAndroid.request(perm, {
    title: '访问本地音乐',
    message: '用于扫描设备上的音乐文件并添加到播放列表',
    buttonPositive: '允许',
    buttonNegative: '拒绝',
  });
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

async function walk(dir: string, depth: number, out: DeviceTrack[]): Promise<void> {
  if (depth > 4) return;
  let entries: string[] = [];
  try { entries = await RNBlobUtil.fs.ls(dir); } catch { return; }
  for (const e of entries) {
    const full = `${dir}/${e}`;
    let stat: { type?: string; size?: number; lastModified?: number } | null = null;
    try { stat = await RNBlobUtil.fs.stat(full); } catch { continue; }
    if (!stat) continue;
    if (stat.type === 'directory') await walk(full, depth + 1, out);
    else if (AUDIO_RE.test(e)) {
      const stem = e.replace(AUDIO_RE, '');
      const dash = stem.split(/\s+-\s+|\s-\s/); // "歌手 - 歌名" 约定
      out.push({
        path: full,
        name: dash.length >= 2 ? dash.slice(1).join(' - ').trim() : stem,
        singer: dash.length >= 2 ? dash[0].trim() : '本地音乐',
        size: stat.size || 0,
        mtime: stat.lastModified || 0,
      });
    }
  }
}

export interface ScanResult { count: number; ms: number }

export async function scanDeviceMusic(onProgress?: (found: number) => void): Promise<ScanResult> {
  const t0 = Date.now();
  const out: DeviceTrack[] = [];
  for (const root of SCAN_ROOTS) {
    await walk(root, 0, out);
    onProgress?.(out.length);
  }
  // 去重（按路径）+ 按修改时间倒序（新文件在前）
  const seen = new Set<string>();
  const unique = out.filter(t => { if (seen.has(t.path)) return false; seen.add(t.path); return true; });
  unique.sort((a, b) => b.mtime - a.mtime);
  writeAll(unique);
  return { count: unique.length, ms: Date.now() - t0 };
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
