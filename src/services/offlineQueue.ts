// lx164:离线写队列——服务器不可达时变更先落本地(MMKV),恢复连接自动补传。
// 防 lx122 指数复制:入队一律 appToLx 归一(条目带 id),重放按 lxNormKey 去重后才写服务器。
// 触发:AppState connected false→true / 登录成功 / 回前台(见 state/AppState.tsx)。
import { createMMKV } from 'react-native-mmkv';
import { sync, appToLx, lxNormKey, type LXSong } from './sync';
import { store as httpStore, type SongItem } from './server';

const kv = createMMKV({ id: 'nextmusic-outbox' });
const KEY = 'q';

export interface ArtistF { name: string; id: string; source?: string; img?: string; count?: number }
export interface AlbumF { name: string; singer?: string; id: string; source?: string; img?: string }

/** 入队形态(调用方传 App 形态 SongItem;enqueue 内部归一为带 id 的 LX 再落盘) */
export type OutboxInput =
  | { k: 'love'; song: SongItem }
  | { k: 'unlove'; key: string }
  | { k: 'loveMany'; songs: SongItem[] }
  | { k: 'unloveMany'; keys: string[] }
  | { k: 'plCreate'; name: string; songs: SongItem[] }
  | { k: 'plUpload'; name: string; songs: SongItem[] } // 整单覆盖(上传/导入)
  | { k: 'plAdd'; name: string; songs: SongItem[] }
  | { k: 'plRename'; id?: string; name: string; newName: string }
  | { k: 'plRemove'; id?: string; name: string }
  | { k: 'plDelSong'; id?: string; name: string; key: string }
  | { k: 'artists'; list: ArtistF[] } // 全量覆盖 API,同类只留最新
  | { k: 'albums'; list: AlbumF[] };

function load(): OutboxInput[] { try { return JSON.parse(kv.getString(KEY) || '[]') as OutboxInput[]; } catch { return []; } }
function save(q: OutboxInput[]): void { try { kv.set(KEY, JSON.stringify(q)); } catch { /* ignore */ } }

/** 调用方传入 SongItem → LX 归一(内部使用;幂等:已是 LX 形态时 songmid 为空,原样保留) */
function toStored(op: OutboxInput): OutboxInput {
  const o = op as Record<string, unknown>;
  if (o.k === 'love' && o.song) {
    const s = o.song as SongItem;
    if (s.songmid) o.song = appToLx(s);
  }
  if (Array.isArray(o.songs)) {
    o.songs = (o.songs as SongItem[]).map(s => ((s as SongItem).songmid ? appToLx(s as SongItem) : s)) as never;
  }
  return op;
}

function dedupLx(list: LXSong[]): LXSong[] {
  const seen = new Set<string>();
  const out: LXSong[] = [];
  for (const x of list) { const k = lxNormKey(x as never); if (seen.has(k)) continue; seen.add(k); out.push(x); }
  return out;
}

export const offlineQueue = {
  pending(): number { return load().length; },

  /** 入队:归一 + 合并(love/unlove 同 key 后到终结先到;artists/albums 全量覆盖留最新;同名整单留最新) */
  enqueue(op: OutboxInput): void {
    const q = load();
    const o = toStored(op) as Record<string, unknown>;
    const drop = new Set<number>();
    const kind = o.k as string;
    if (kind === 'love' || kind === 'unlove') {
      const k1 = kind === 'love' ? lxNormKey(o.song as never) : (o.key as string);
      q.forEach((e0, i) => {
        const e = e0 as Record<string, unknown>;
        const ek = e.k as string;
        if (ek === 'love' || ek === 'unlove') {
          const k2 = ek === 'love' ? lxNormKey(e.song as never) : (e.key as string);
          if (k1 === k2) drop.add(i);
        }
      });
    } else if (kind === 'artists' || kind === 'albums') {
      q.forEach((e0, i) => { if ((e0 as Record<string, unknown>).k === kind) drop.add(i); });
    } else if (kind === 'plUpload' || kind === 'plCreate') {
      q.forEach((e0, i) => {
        const e = e0 as Record<string, unknown>;
        const ek = e.k as string;
        if ((ek === 'plUpload' || ek === 'plCreate') && e.name === o.name) drop.add(i);
      });
    }
    const next = q.filter((_, i) => !drop.has(i));
    next.push(op); // op 已被 toStored 就地归一
    save(next);
  },

  /** 重放(恢复连接后调用)。逐条 fetch+改+推,失败即停保留剩余;每 3 条让出主线程(TV 弱芯片,lx163f 同思路) */
  async flush(): Promise<number> {
    if (!httpStore.base || !httpStore.token) return 0;
    let done = 0;
    let q = load();
    while (q.length) {
      let ok = false;
      try { ok = await applyOp(q[0]); } catch { ok = false; }
      if (!ok) break;
      q = q.slice(1);
      done++;
      save(q);
      if (done % 3 === 0) await new Promise(r => setTimeout(r, 0));
    }
    return done;
  },

  /** 仅「移除服务器/退出账号」可调(disconnectServer) */
  clear(): void { kv.remove(KEY); },
};

async function applyOp(op: OutboxInput): Promise<boolean> {
  switch (op.k) {
    case 'love':
    case 'unlove': {
      const snap = await sync.fetchLists({ force: true });
      if (!snap) return false;
      const key = op.k === 'love' ? lxNormKey(op.song as never) : op.key;
      const has = (snap.loveList || []).some(x => lxNormKey(x as never) === key);
      if (op.k === 'love') { if (!has) snap.loveList = [op.song as unknown as LXSong, ...snap.loveList]; else return true; }
      else { if (has) snap.loveList = (snap.loveList || []).filter(x => lxNormKey(x as never) !== key); else return true; }
      return sync.pushLists(snap);
    }
    case 'loveMany':
    case 'unloveMany': {
      const snap = await sync.fetchLists({ force: true });
      if (!snap) return false;
      const cur = snap.loveList || [];
      if (op.k === 'loveMany') {
        const have = new Set(cur.map(x => lxNormKey(x as never)));
        const add = (op.songs as unknown as LXSong[]).filter(s => !have.has(lxNormKey(s as never)));
        if (!add.length) return true;
        snap.loveList = [...add, ...cur];
      } else {
        const kill = new Set(op.keys);
        const next = cur.filter(x => !kill.has(lxNormKey(x as never)));
        if (next.length === cur.length) return true;
        snap.loveList = next;
      }
      return sync.pushLists(snap);
    }
    case 'plCreate':
    case 'plUpload':
    case 'plAdd': {
      const snap = await sync.fetchLists({ force: true });
      if (!snap) return false;
      let u = (snap.userList || []).find(x => x.name === op.name);
      const songs = op.songs as unknown as LXSong[];
      if (!u) {
        u = { id: `ul-${Date.now()}`, name: op.name, source: 'kw', list: [] };
        snap.userList = [u, ...(snap.userList || [])];
      }
      if (op.k === 'plUpload') { u.list = dedupLx(songs); } // 整单覆盖
      else {
        const have = new Set((u.list || []).map(x => lxNormKey(x as never)));
        const add = songs.filter(s => !have.has(lxNormKey(s as never)));
        if (!add.length) return true;
        u.list = [...add, ...(u.list || [])];
      }
      return sync.pushLists(snap);
    }
    case 'plRename': {
      const snap = await sync.fetchLists({ force: true });
      if (!snap) return false;
      const u = (snap.userList || []).find(x => (op.id ? x.id === op.id : x.name === op.name));
      if (!u) snap.userList = [{ id: `ul-${Date.now()}`, name: op.newName, source: 'kw', list: [] }, ...(snap.userList || [])]; // 与 playlistSync.rename 同语义:无则建
      else u.name = op.newName;
      return sync.pushLists(snap);
    }
    case 'plRemove': {
      const snap = await sync.fetchLists({ force: true });
      if (!snap) return false;
      const before = (snap.userList || []).length;
      snap.userList = (snap.userList || []).filter(x => (op.id ? x.id !== op.id : x.name !== op.name));
      if (snap.userList.length === before) return true; // 已不在:幂等成功
      return sync.pushLists(snap);
    }
    case 'plDelSong': {
      const snap = await sync.fetchLists({ force: true });
      if (!snap) return false;
      const u = (snap.userList || []).find(x => (op.id ? x.id === op.id : x.name === op.name));
      if (!u) return true;
      const before = (u.list || []).length;
      u.list = (u.list || []).filter(x => lxNormKey(x as never) !== op.key);
      if ((u.list || []).length === before) return true;
      return sync.pushLists(snap);
    }
    case 'artists': return sync.pushLibraryArtists(op.list);
    case 'albums': return sync.pushLibraryAlbums(op.list);
  }
  return false;
}
