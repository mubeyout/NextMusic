// lx163:歌单 CRUD 双向同步——本地 library 操作镜像到服务器 userList(登录态),
// 名字做关联键(与 web 端同名合并语义一致);未登录退化为纯本地。
// 服务器/其他端变更由 subscribeSync + 前台刷新(App active)拉回——闭环双向。
import { library } from './library';
import { sync } from '../services/sync';
import { store as httpStore } from '../services/server';
import type { SongItem } from '../services/server';

async function withServerSnap(mut: (snap: any) => boolean | Promise<boolean>): Promise<boolean> {
  if (!httpStore.base || !httpStore.token) return false; // 未登录退化为纯本地
  try {
    const snap = await sync.fetchLists();
    if (!snap) return false;
    const changed = await mut(snap);
    if (!changed) return false;
    return await sync.pushLists(snap);
  } catch { return false; }
}

function userListByName(snap: any, name: string) {
  return (snap.userList || []).find((u: { name?: string }) => u.name === name);
}

export const playlistSync = {
  /** 新建歌单:本地 + 服务器同名空列表 */
  async create(name: string, songs: SongItem[] = []): Promise<string> {
    const pl = library.create(name, songs);
    const { appToLx } = await import('../services/sync');
    void withServerSnap(snap => {
      if (userListByName(snap, name)) return false;
      snap.userList = [{ id: `ul-${Date.now()}`, name, source: 'kw', list: songs.map(appToLx) }, ...(snap.userList || [])];
      return true;
    });
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
    });
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
    });
  },

  /** 本地歌单加歌:镜像推到服务器同名列表 */
  async addSongs(localId: string, songs: SongItem[]): Promise<void> {
    library.addSongs(localId, songs);
    const pl = library.get(localId);
    if (!pl || pl.name === '我喜欢的') return; // 我喜欢的走 loveList(favorites.ts)
    const { appToLx } = await import('../services/sync');
    void withServerSnap(snap => {
      const u = userListByName(snap, pl.name);
      if (!u) {
        snap.userList = [{ id: `ul-${Date.now()}`, name: pl.name, source: 'kw', list: songs.map(appToLx) }, ...(snap.userList || [])];
        return true;
      }
      const keys = new Set(songs.map(s => `${s.source}_${s.songmid}`));
      u.list = [...songs.map(appToLx), ...(u.list || []).filter((x: { id?: string }) => !keys.has(x.id || ''))];
      return true;
    });
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
    });
  },
};
