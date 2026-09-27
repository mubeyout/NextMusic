// cloudLibrary —— 云曲库(登录个人空间)service 层(LEO spec③ · API contract v2 §5)
// 云曲库 = 账号自有「自定义音乐目录」(契约 §2.1 用量口径);内容/流端点复用 myLibrary 既有族(无 lib=本人)
// 配额:契约 §5.1 GET /api/cloud-library/quota(登录即可,不依赖公共曲库授权)
// 删除:契约未覆盖删除端点(服务端上传链路 checkQuota 钩子已预留,P1 合入)——此处只留 TODO stub,不造假数据
import { Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import { req, store } from './server';
import { myLib, type LibSong } from './myLibrary';
import { enqueueUpload } from '../state/UploadQueue';
import { deviceTracks } from './devicelibrary';
import { toast } from '../components/Dialog';

export interface QuotaInfo { enabled: boolean; usedBytes: number; quotaBytes: number; quotaMB: number; percent: number }

async function unwrap<T>(p: Promise<unknown>): Promise<T> {
  const r = await p as { success?: boolean; data?: T; message?: string };
  if (r && typeof r === 'object' && 'data' in r) {
    if (r.success === false) throw new Error(r.message || '服务器返回失败');
    return r.data as T;
  }
  return r as T;
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '--';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export const cloudLib = {
  /** 契约 §5.1:个人配额(quotaBytes=-1 即不限;percent≥80 黄/100 红——阈值判断在客户端) */
  quota(): Promise<QuotaInfo> {
    return unwrap<QuotaInfo>(req('/api/cloud-library/quota'));
  },

  /** 云曲库歌曲列表:复用本人库既有端点(契约 §0「无 lib → 用户本人云曲库」);
   *  home 的 recent + songs recent 合并去重(spec③ 歌曲列表数据源,不造假) */
  async songs(): Promise<LibSong[]> {
    const seen = new Set<string>();
    const out: LibSong[] = [];
    const push = (l: LibSong[]) => { for (const s of l) { const k = s.id || s.filename; if (!seen.has(k)) { seen.add(k); out.push(s); } } };
    const [h, r] = await Promise.all([myLib.home(), myLib.songs('recent', 200)]);
    push(h.recent || []);
    push(r.songs || []);
    return out;
  },

  /** TODO(P1 服务端):云曲库删除端点未入契约 v2(服务端上传链路 checkQuota 钩子已预留);
   *  客户端分级确认 UI 已建好,端点合入后把本方法替换为真实请求即可。当前恒失败,不假删。 */
  async remove(files: string[]): Promise<void> {
    void files;
    throw new Error('云曲库删除接口待服务端上线');
  },
};

// ── 上传历史(「我上传的」分组原料;跨会话 MMKV 持久) ──
const upKv = createMMKV({ id: 'nextmusic-cloud-uploads' });
export interface UploadHistItem { name: string; size: number; at: number }
function readHist(): UploadHistItem[] {
  try { return JSON.parse(upKv.getString('hist') || '[]') as UploadHistItem[]; } catch { return []; }
}
export function recordUploaded(items: { name: string; size?: number }[]) {
  if (!items.length) return;
  const base = readHist().slice(0, 499);
  const now = Date.now();
  const add = items.map(i => ({ name: i.name, size: i.size || 0, at: now }));
  try { upKv.set('hist', JSON.stringify([...add, ...base])); } catch { /* 配额满忽略 */ }
}
/** 上传过的文件基名集合(匹配云端文件名,喂「我上传的」分组) */
export function uploadedBases(): Set<string> {
  const s = new Set<string>();
  for (const h of readHist()) {
    const b = (h.name || '').split('/').pop() || '';
    if (b) s.add(b.toLowerCase());
  }
  return s;
}

// ── 配额预检 + 上传动作(spec③ 上传交互) ──
export interface PrecheckResult { fit: number; total: number; est: number; remain: number; quota: QuotaInfo | null }

/** 上传前配额预检:quota 不可达时不拦(服务器仍会硬校验);quotaBytes=-1 不限直通 */
export async function precheckUpload(items: { name: string; size: number }[]): Promise<PrecheckResult> {
  const est = items.reduce((n, i) => n + (i.size || 0), 0);
  let quota: QuotaInfo | null = null;
  try { quota = await cloudLib.quota(); } catch { quota = null; }
  if (!quota || !quota.enabled || quota.quotaBytes < 0) return { fit: items.length, total: items.length, est, remain: -1, quota };
  const remain = Math.max(0, quota.quotaBytes - quota.usedBytes);
  let acc = 0, fit = 0;
  for (const it of items) { // 前缀截断=部分上传(超限警示后按原顺序传放得下的)
    if (acc + (it.size || 0) <= remain) { acc += it.size || 0; fit++; } else break;
  }
  return { fit, total: items.length, est, remain, quota };
}

/** 菜单/批量条统一入口:本机曲库歌(source='device')→ 预检 → 入队(队列 sheet 承接进行态) */
export async function uploadDeviceSongs(songs: { songmid: string; name?: string }[]): Promise<'ok' | 'empty' | 'noquota' | 'partial' | 'err'> {
  if (!store.token) { return 'err'; }
  let tracks: { uri: string; name: string; size: number }[] = [];
  try {
    const byPath = new Map(deviceTracks().map(d => [d.path, d]));
    for (const s of songs) {
      const t = byPath.get(s.songmid);
      if (t) tracks.push({ uri: t.path, name: (t.path.split('/').pop() || t.name || 'audio'), size: t.size || 0 });
    }
  } catch { tracks = []; }
  if (!tracks.length) {
    // web/无设备库兜底:SAF/文件选择器(spec⑪A pickAndUpload 管线)
    if (Platform.OS === 'web') {
      const { pickAndUpload } = await import('../screens/UploadSheet');
      pickAndUpload(undefined, '云曲库');
      return 'ok';
    }
    return 'empty';
  }
  const pc = await precheckUpload(tracks);
  if (pc.fit <= 0) return 'noquota';
  const list = pc.fit < tracks.length ? tracks.slice(0, pc.fit) : tracks;
  enqueueUpload(list.map(t => ({ uri: t.uri, name: t.name })), undefined, '云曲库');
  return pc.fit < tracks.length ? 'partial' : 'ok';
}

/** 带 toast 反馈的上传入口(⋯菜单/多选动作条共用;配额预检失败=toast,LEO 裁决②) */
export async function uploadWithFeedback(songs: { songmid: string; name?: string }[]): Promise<boolean> {
  if (!store.token) { toast('请先登录服务器'); return false; }
  try {
    const r = await uploadDeviceSongs(songs);
    if (r === 'ok') { toast(`已加入上传队列（${songs.length} 首）`); return true; }
    if (r === 'partial') { toast('配额不足，已按剩余空间部分加入上传'); return true; }
    if (r === 'noquota') { toast('云曲库空间不足，无法上传'); return false; }
    if (r === 'empty') { toast('未找到本机文件'); return false; }
    return false;
  } catch {
    toast('上传失败，请重试');
    return false;
  }
}
