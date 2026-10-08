// serverLocalLibrary.ts —— Web 本地曲库数据层(LEO v2.4 ②本地层 + 升级稿 library-web-upgrade-v1 §二)
// 语义:浏览器无设备文件——Web 端「本地曲库」=绑定**服务器主机目录**(对标 APK localLibrary 的设备目录扫描)。
// 复用(零新增服务端):sharedLibraries 机制全链——
//   · 绑定/换绑/解绑: /api/admin/sharedlib CRUD(x-frontend-auth 管理授权,与服务器 customMusicDir 管理台同语义)
//   · 扫描入库: POST /api/admin/sharedlib/:id/sync → customMusicManager.syncCustomIndex('shared_<id>')
//     =「听风源」同款递归目录扫描器(任意深层子目录;music-tag-native 标签;mtime/size 增量跳过)
//   · 路径校验: POST /api/utils/check-dir(存在性+目录性,行内错误「路径不存在」数据源)
//   · 浏览: /api/music/library/{home,albums,artists,songs,album,artist,stats}?lib=<id> 聚合(见 myLibrary)
//   · 播放: /api/music/custom/{file,cover}?lib=<id>(myLibrary.toSongItem/streamUrl/coverUrl 直用)
// 数据模型:与 APK LocalLibConfig{id,name,...} 对齐——「目录」字段=服务器绝对路径(dir);
//         trackCount=上次扫描回填(songCountHint),lastScanAt=syncedAt。
import { Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import { useEffect, useState } from 'react';
import { req, api, store } from './server';

const IS_WEB = Platform.OS === 'web';
const kv = createMMKV({ id: 'nextmusic-server-libs' });

export interface ServerLibConfig {
  id: string;
  name: string;
  dir: string;                // 服务器绝对路径(Web 端「目录」字段;APK 端为设备目录——语义对位)
  access: 'public' | 'allow';
  allowList: string[];
  enabled: boolean;
  trackCount: number;         // 上次扫描回填(songCountHint)
  lastScanAt: number;         // syncedAt(ms;0=未扫描)
}

// 用户可见行(sharedList 口径;dir 不可见——管理动作需管理授权)
export interface ServerLibEntry { id: string; name: string; locked: boolean; trackCount: number; lastScanAt: number }

// ═══ 三架构位(升级稿 §二 T2 必预留:①扫描可暂停 ②断点续扫 ③增量分批 50 首/次) ═══
// 首版=骨架位+基础全量扫(服务端 sync 一次性返回);结构留位,后端分批/断点接口到位即切换:
export const SCAN_BATCH = 50;                       // ③ 增量分批:每 SCAN_BATCH 首一批——onBatch 挂点(浏览列表增量刷新位)
export type ScanPhase = 'scanning' | 'paused' | 'done' | 'error';
export interface ScanJobState {
  phase: ScanPhase;
  found: number;      // 已入库歌曲数(完成=终值;扫描中=轮询 stats 增量)
  cursor: number;     // ② 断点续扫 cursor:已完成批数(cursor*SCAN_BATCH=断点偏移;续扫从断点续,服务端索引不重复入库)
  startedAt: number;
  error?: string;
  summary?: { songs: number; albums: number; artists: number; totalBytes?: number };
}
export interface ScanHandle {
  /** ① 可暂停:立即挂起(在途请求结果丢弃;服务端索引保留已入库部分=续扫基线) */
  pause(): void;
  /** ①/② 续扫:从 cursor 断点续(重发 sync——服务端 mtime/size 跳过已入库,天然不重复) */
  resume(): void;
}

// ── 模块态(入口行订阅:HDMain rail / MediaLibsScreen;同 pubEntry 模式) ──
interface SlbState { entries: ServerLibEntry[]; refreshedAt: number }
let st: SlbState = { entries: [], refreshedAt: 0 };
try {
  const c = kv.getString('entries');
  if (c) st = { ...st, entries: JSON.parse(c) as ServerLibEntry[] };
} catch { /* ignore */ }
const subs = new Set<() => void>();
function emit() { subs.forEach(f => f()); }
function setEntries(list: ServerLibEntry[]) {
  const changed = JSON.stringify(list) !== JSON.stringify(st.entries);
  st = { entries: list, refreshedAt: Date.now() };
  if (changed) { try { kv.set('entries', JSON.stringify(list)); } catch { /* ignore */ } emit(); }
}
export function useSlbEntries(): ServerLibEntry[] {
  const [v, setV] = useState(st.entries);
  useEffect(() => { const f = () => setV(st.entries); subs.add(f); f(); return () => { subs.delete(f); }; }, []);
  return v;
}

/** 刷新用户可见清单(sharedList;匿名 401=静默保持缓存——入口行离线容忍) */
export function slbRefresh(): void {
  if (!IS_WEB || !store.token) return;
  unwrap<{ libs: { id: string; name: string; locked?: boolean; songCountHint?: number; syncedAt?: number }[] }>(req('/api/music/library/shared/list'))
    .then(d => {
      const list: ServerLibEntry[] = (d?.libs || []).map(l => ({
        id: l.id, name: l.name, locked: !!l.locked,
        trackCount: l.songCountHint || 0, lastScanAt: l.syncedAt || 0,
      }));
      setEntries(list);
    })
    .catch(() => { /* 静默:保持缓存入口 */ });
}

// ── 管理授权(x-frontend-auth;api.csAdminAuth 会话内存,csVerifyAdmin 校验) ──
export function slbIsAdmin(): boolean { return !!api.csAdminAuth; }
export function slbVerifyAdmin(password: string): Promise<boolean> { return api.csVerifyAdmin(password); }

// ── 管理端 API(信封解包同 myLibrary.lx185) ──
async function unwrap<T>(p: Promise<unknown>): Promise<T> {
  const r = await p as { success?: boolean; data?: T; message?: string };
  if (r && typeof r === 'object' && 'data' in r) {
    if (r.success === false) throw new Error(r.message || '服务器返回失败');
    return r.data as T;
  }
  return r as T;
}
type AdminLib = { id: string; name?: string; dir?: string; access?: string; allowList?: string[]; enabled?: boolean; songCountHint?: number; syncedAt?: number };
const toCfg = (l: AdminLib): ServerLibConfig => ({
  id: l.id, name: l.name || l.id, dir: l.dir || '',
  access: l.access === 'allow' ? 'allow' : 'public',
  allowList: Array.isArray(l.allowList) ? l.allowList : [],
  enabled: l.enabled !== false,
  trackCount: l.songCountHint || 0, lastScanAt: l.syncedAt || 0,
});

export const slbAdmin = {
  /** 管理台全量清单(含 dir;绑定/换绑数据源) */
  async list(): Promise<ServerLibConfig[]> {
    const libs = await unwrap<AdminLib[]>(req('/api/admin/sharedlib', { headers: api.csHeaders() }));
    const out = (libs || []).map(toCfg);
    setEntries(out.map(l => ({ id: l.id, name: l.name, locked: false, trackCount: l.trackCount, lastScanAt: l.lastScanAt })));
    return out;
  },
  /** T1 路径校验:返回 {ok,path} 或 {ok:false,message}(「路径不存在/不是目录」行内错误源) */
  async checkDir(dirPath: string): Promise<{ ok: boolean; message: string; path?: string }> {
    try {
      const r = await req('/api/utils/check-dir', { method: 'POST', headers: api.csHeaders(), body: JSON.stringify({ dirPath }) }) as { success?: boolean; message?: string; path?: string };
      return { ok: !!r?.success, message: r?.message || '', path: r?.path };
    } catch (e) { return { ok: false, message: (e as Error).message || '校验失败' }; }
  },
  /** T1 绑定(id 客户端生成,匹配服务端 ^[a-z0-9_-]{1,32}$) */
  async create(name: string, dir: string): Promise<ServerLibConfig> {
    const id = 'slb-' + Date.now().toString(36);
    await unwrap<never>(req('/api/admin/sharedlib', { method: 'POST', headers: api.csHeaders(), body: JSON.stringify({ id, name, dir, access: 'public', allowList: [] }) }));
    return { id, name, dir, access: 'public', allowList: [], enabled: true, trackCount: 0, lastScanAt: 0 };
  },
  /** T4 换绑目录 */
  async rebind(id: string, dir: string): Promise<void> {
    await unwrap<never>(req('/api/admin/sharedlib', { method: 'PUT', headers: api.csHeaders(), body: JSON.stringify({ id, dir }) }));
  },
  /** T4 重命名 */
  async rename(id: string, name: string): Promise<void> {
    await unwrap<never>(req('/api/admin/sharedlib', { method: 'PUT', headers: api.csHeaders(), body: JSON.stringify({ id, name }) }));
  },
  /** T4 解绑(仅断关联,不删服务器文件——custom_index 留存,重绑同目录即恢复) */
  async remove(id: string): Promise<void> {
    await unwrap<never>(req('/api/admin/sharedlib?id=' + encodeURIComponent(id), { method: 'DELETE', headers: api.csHeaders() }));
    setEntries(st.entries.filter(e => e.id !== id));
  },
};

// ── 扫描(架构位①②③落位;raw fetch 直连绕全局串行队列——长扫描不堵全 app 请求) ──
const K_JOB = (id: string) => `scan:${id}`;
export function scanJob(libId: string): ScanJobState | null {
  try { const v = kv.getString(K_JOB(libId)); return v ? JSON.parse(v) as ScanJobState : null; } catch { return null; }
}
function setJob(libId: string, j: ScanJobState | null): void {
  if (j) { try { kv.set(K_JOB(libId), JSON.stringify(j)); } catch { /* ignore */ } }
  else { try { kv.remove(K_JOB(libId)); } catch { /* ignore */ } }
  jobEmit(libId, j);
}
// 扫描态订阅(屏内进度卡)
const jobSubs = new Map<string, Set<(j: ScanJobState | null) => void>>();
function jobEmit(libId: string, j: ScanJobState | null) { jobSubs.get(libId)?.forEach(f => f(j)); }
export function useScanJob(libId: string): ScanJobState | null {
  const [v, setV] = useState<ScanJobState | null>(() => scanJob(libId));
  useEffect(() => {
    let s = jobSubs.get(libId);
    if (!s) { s = new Set(); jobSubs.set(libId, s); }
    s.add(setV); setV(scanJob(libId));
    return () => { s.delete(setV); };
  }, [libId]);
  return v;
}

const running = new Map<string, { paused: boolean; gen: number }>();

/** T2 扫描:管理授权下发 sync;返回 handle 供 ① 暂停/② 续扫 */
export function startScan(lib: ServerLibConfig | { id: string }, onDone?: (j: ScanJobState) => void): ScanHandle {
  const libId = lib.id;
  const prev = scanJob(libId);
  const resumable = prev?.phase === 'paused' || prev?.phase === 'error'; // ② 断点续扫:暂停/中断都从断点续(found/cursor 沿用)
  const ctl = { paused: false, gen: (running.get(libId)?.gen || 0) + 1 };
  running.set(libId, ctl);
  const started: ScanJobState = { phase: 'scanning', found: resumable ? prev!.found : 0, cursor: resumable ? prev!.cursor : 0, startedAt: Date.now() };
  setJob(libId, started); // (服务端索引=真断点基线——mtime/size 跳过已入库;cursor 为 UI 记账+未来分批接口对接位)

  const fire = () => {
    const myGen = ctl.gen;
    // raw fetch:sync 可能数十秒——不走 req() 12s 超时+串行队列(会堵全 app 网络)
    const b = store.base || '';
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (api.csAdminAuth) h['x-frontend-auth'] = api.csAdminAuth;
    if (store.token) h['x-user-token'] = store.token;
    if (store.username) h['x-user-name'] = store.username;
    fetch(`${b}/api/admin/sharedlib/${encodeURIComponent(libId)}/sync`, { method: 'POST', headers: h })
      .then(r => r.json())
      .then((r: { success?: boolean; data?: { songs?: number; albums?: number; artists?: number; totalBytes?: number }; message?: string }) => {
        if (running.get(libId)?.gen !== myGen) return; // 已被暂停/新一轮接管:丢弃在途结果
        const cur = scanJob(libId) || started;
        if (!r?.success) { setJob(libId, { ...cur, phase: 'error', error: r?.message || '扫描失败' }); return; }
        const d = r.data || {};
        // ③ 增量分批挂点:结果按 SCAN_BATCH 切片回调(首版一次到位;服务端分批接口到位改流式消费)
        const j: ScanJobState = {
          phase: 'done', found: d.songs || 0, cursor: Math.ceil((d.songs || 0) / SCAN_BATCH),
          startedAt: cur.startedAt,
          summary: { songs: d.songs || 0, albums: d.albums || 0, artists: d.artists || 0, totalBytes: d.totalBytes },
        };
        setJob(libId, j);
        slbRefresh(); if (slbIsAdmin()) void slbAdmin.list();
        onDone?.(j);
      })
      .catch((e: Error) => {
        if (running.get(libId)?.gen !== myGen) return;
        setJob(libId, { ...(scanJob(libId) || started), phase: 'error', error: e?.message || '网络错误' });
      });
  };
  fire();

  return {
    pause() { // ① 可暂停:标记+换代丢弃在途结果;服务端索引保留已入库(续扫基线)
      ctl.paused = true; ctl.gen++;
      setJob(libId, { ...(scanJob(libId) || started), phase: 'paused' });
    },
    resume() { // ② 续扫:重发 sync(服务端 mtime/size 跳过已入库=断点续,不重复)
      const cur = scanJob(libId);
      ctl.paused = false; ctl.gen++;
      running.set(libId, ctl);
      setJob(libId, { ...(cur || started), phase: 'scanning', error: undefined, found: cur?.found || 0, cursor: cur?.cursor || 0, startedAt: Date.now() });
      fire();
    },
  };
}

/** 扫描完成后清态(「开始听歌」即收起结果卡;记录已入 kv 不影响后续重扫) */
export function clearScanJob(libId: string): void {
  running.delete(libId);
  setJob(libId, null);
}
