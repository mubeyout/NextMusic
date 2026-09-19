// lx163:歌单 CRUD 双向同步——本地 library 操作镜像到服务器 userList(登录态),
// 名字做关联键(与 web 端同名合并语义一致);未登录退化为纯本地。
// 服务器/其他端变更由 subscribeSync + 前台刷新(App active)拉回——闭环双向。
import { library } from './library';
import { sync, appToLx } from '../services/sync';
import { store as httpStore } from '../services/server';
import type { SongItem } from '../services/server';

async function withServerSnap(mut: (snap: any) => boolean | Promise<boolean>, op?: import('../services/offlineQueue').OutboxInput): Promise<boolean> {
  if (!httpStore.base || !httpStore.token) return false; // 未登录退化为纯本地
  try {
    const snap = await sync.fetchLists();
    if (!snap) {
      // lx164:无缓存且不可达——本地已改,入队待补传(重放时从服务器快照补)
      if (op) void import('../services/offlineQueue').then(m => m.offlineQueue.enqueue(op)).catch(() => {});
      return false;
    }
    const changed = await mut(snap);
    if (!changed) return false;
    const ok = await sync.pushLists(snap);
    if (!ok) {
      // lx164:服务器不可达——乐观变更落缓存(重启可见)+入离线队列(恢复连接补传),不再静默丢
      sync.persistSnap(snap);
      if (op) void import('../services/offlineQueue').then(m => m.offlineQueue.enqueue(op)).catch(() => {});
      return true;
    }
    return true;
  } catch { return false; }
}

function userListByName(snap: any, name: string) {
  return (snap.userList || []).find((u: { name?: string }) => u.name === name);
}

export const playlistSync = {
  /** 新建歌单:本地 + 服务器同名空列表 */
  async create(name: string, songs: SongItem[] = []): Promise<string> {
    const pl = library.create(name, songs);
    void withServerSnap(snap => {
      if (userListByName(snap, name)) return false;
      snap.userList = [{ id: `ul-${Date.now()}`, name, source: 'kw', list: songs.map(appToLx) }, ...(snap.userList || [])];
      return true;
    }, { k: 'plCreate', name, songs }); // lx164:离线入队
    return pl.id;
  },

  /** 重命名:本地 + 服务器同名列表改名 */
  async rename(localId: string, newName: string): Promise<boolean> {
    const pl = library.get(localId);
    if (!pl) return false;
    library.update(localId, { name: newName });
    return withServerSnap(snap => {
      const u = userListByName(snap, pl.name);
      if (!u) { // 无同名服务器列表:改名后顺手建(首次同步语义)
        snap.userList = [{ id: `ul-${Date.now()}`, name: newName, source: 'kw', list: [] }, ...(snap.userList || [])];
        return true;
      }
      u.name = newName;
      return true;
    }, { k: 'plRename', name: pl.name, newName });
  },

  /** 删除:本地 + 服务器同名列表 */
  async remove(localId: string): Promise<boolean> {
    const pl = library.get(localId);
    if (!pl) return false;
    library.remove(localId);
    return withServerSnap(snap => {
      const before = (snap.userList || []).length;
      snap.userList = (snap.userList || []).filter((u: { name?: string }) => u.name !== pl.name);
      return (snap.userList || []).length !== before;
    }, { k: 'plRemove', name: pl.name });
  },

  /** 本地歌单加歌:镜像推到服务器同名列表 */
  async addSongs(localId: string, songs: SongItem[]): Promise<void> {
    library.addSongs(localId, songs);
    const pl = library.get(localId);
    if (!pl || pl.name === '我喜欢的') return; // 我喜欢的走 loveList(favorites.ts)
    void withServerSnap(snap => {
      const u = userListByName(snap, pl.name);
      if (!u) {
        snap.userList = [{ id: `ul-${Date.now()}`, name: pl.name, source: 'kw', list: songs.map(appToLx) }, ...(snap.userList || [])];
        return true;
      }
      const keys = new Set(songs.map(s => `${s.source}_${s.songmid}`));
      u.list = [...songs.map(appToLx), ...(u.list || []).filter((x: { id?: string }) => !keys.has(x.id || ''))];
      return true;
    }, { k: 'plAdd', name: pl.name, songs });
  },

  /** 本地歌单移除单曲:镜像 */
  async removeSong(localId: string, song: SongItem): Promise<void> {
    library.removeSong(localId, song);
    const pl = library.get(localId);
    if (!pl || pl.name === '我喜欢的') return;
    void withServerSnap(snap => {
      const u = userListByName(snap, pl.name);
      if (!u) return false;
      const key = `${song.source}_${song.songmid}`;
      const before = (u.list || []).length;
      u.list = (u.list || []).filter((x: { id?: string }) => (x.id || '') !== key);
      return (u.list || []).length !== before;
    }, { k: 'plDelSong', name: pl.name, key: `${song.source}_${song.songmid}` });
  },
};
