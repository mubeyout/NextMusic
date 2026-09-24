// UploadQueue —— 我的曲库上传队列(P1b 0924)
// 全局单例 store + subscribe(模式同 downloads.ts):设备音乐屏批量入口 → 串行上传(每文件一请求,行级进度/重试)
// → 完成态汇总;最小化后浮条常驻。并发取 2(spec:2-3)。
import { uploadToLibrary, type UploadItem, type UploadResult } from '../services/myLibrary';

export type UpState = 'wait' | 'up' | 'done' | 'skip' | 'fail';
export interface UpItem {
  key: string; uri: string; name: string;
  st: UpState; prog: number; // 0-1
  reason?: string;
}
export interface UpBatch {
  id: number;
  items: UpItem[];
  doneAt?: number;   // 整批结束时的时间戳(完成卡依据)
  summary?: { uploaded: number; skipped: number; failed: number };
  stats?: UploadResult['stats'];
}
interface Store {
  batch: UpBatch | null;
  minimized: boolean;   // sheet 收起=迷你浮条
  finishedOpen: boolean; // 完成卡展开
}
let store: Store = { batch: null, minimized: false, finishedOpen: false };
const listeners = new Set<() => void>();
function emit() { listeners.forEach(fn => fn()); }
export function subscribeUpload(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function setStore(p: Partial<Store>) { store = { ...store, ...p }; emit(); }
export function getUploadStore() { return store; }

let seq = 0;
/** 批量入队并启动(并发 2);重复调用=替换当前批(仅当空闲) */
export function enqueueUpload(items: UploadItem[]) {
  if (!items.length) return;
  if (store.batch && store.batch.items.some(i => i.st === 'wait' || i.st === 'up')) {
    // 进行中:拒绝新批(UI 层已挡,兜底)
    return;
  }
  const batch: UpBatch = {
    id: ++seq,
    items: items.map((it, i) => ({ key: `${Date.now()}_${i}`, uri: it.uri, name: it.name, st: 'wait' as UpState, prog: 0 })),
  };
  setStore({ batch, minimized: false, finishedOpen: false });
  void runBatch(batch);
}

/** 行级重试(单文件) */
export function retryItem(key: string) {
  const b = store.batch;
  if (!b) return;
  const it = b.items.find(i => i.key === key);
  if (!it || it.st !== 'fail') return;
  it.st = 'wait'; it.prog = 0; it.reason = undefined;
  b.doneAt = undefined; b.summary = undefined;
  setStore({ batch: { ...b, items: [...b.items] }, finishedOpen: false });
  void runBatch(store.batch as UpBatch);
}

/** 失败项一键重试(整批完成后可用) */
export function retryFailed() {
  const b = store.batch;
  if (!b || !b.doneAt) return;
  let woke = false;
  for (const it of b.items) {
    if (it.st === 'fail') { it.st = 'wait'; it.prog = 0; it.reason = undefined; woke = true; }
  }
  if (woke) {
    b.doneAt = undefined; b.summary = undefined;
    setStore({ batch: { ...b, items: [...b.items] }, finishedOpen: false });
    void runBatch(store.batch as UpBatch);
  }
}

async function runBatch(batch: UpBatch) {
  const pending = () => batch.items.filter(i => i.st === 'wait');
  const worker = async () => {
    for (;;) {
      const it = pending()[0];
      if (!it) return;
      it.st = 'up'; setStore({ batch: { ...batch, items: [...batch.items] } });
      try {
        const r = await uploadToLibrary([{ uri: it.uri, name: it.name }], (l, t) => {
          it.prog = t > 0 ? Math.min(0.99, l / t) : 0;
          setStore({ batch: { ...batch, items: [...batch.items] } });
        });
        if (r.uploaded.length) it.st = 'done';
        else if (r.skipped.length) it.st = 'skip';
        else it.st = 'fail';
        it.prog = 1;
        if (r.stats) batch.stats = r.stats;
      } catch (e) {
        it.st = 'fail';
        it.reason = (e as Error).message || '失败';
      }
      setStore({ batch: { ...batch, items: [...batch.items] } });
    }
  };
  await Promise.all([worker(), worker()]); // 并发 2
  // 汇总
  const uploaded = batch.items.filter(i => i.st === 'done').length;
  const skipped = batch.items.filter(i => i.st === 'skip').length;
  const failed = batch.items.filter(i => i.st === 'fail').length;
  batch.summary = { uploaded, skipped, failed };
  batch.doneAt = Date.now();
  setStore({ batch: { ...batch, items: [...batch.items] }, finishedOpen: true });
}

export function minimizeUpload() { setStore({ minimized: true }); }
export function openUploadSheet() { setStore({ minimized: false }); }
export function closeFinished() { setStore({ finishedOpen: false }); }
export function dismissUpload() { setStore({ batch: null, minimized: false, finishedOpen: false }); }
