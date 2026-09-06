// LX Server user-list sync: GET/POST /api/user/list (full snapshot restore)
// LX song format: {id:'wy_123', name, singer, source, interval, meta:{songId, albumName, picUrl, qualitys, _qualitys}}
// App SongItem:  {songmid, name, singer, source, interval, albumName, img, types, _types}
// NOTE: req() auto-injects x-user-token when logged in (see server.ts)
import { req, type SongItem } from './server';
import { createMMKV } from 'react-native-mmkv';
const kvSync = createMMKV({ id: 'nextmusic-sync-cache' });

export interface LXSong {
  id?: string;
  name: string;
  singer: string;
  source: string;
  interval?: string;
  meta?: {
    songId?: number | string;
    albumName?: string;
    picUrl?: string;
    qualitys?: { type: string; size?: string }[];
    _qualitys?: Record<string, { size?: string }>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface LXUserList {
  id: string;
  name: string;
  source?: string;
  sourceListId?: string;
  locationUpdateTime?: number;
  list: LXSong[];
  [k: string]: unknown;
}

export interface UserListsSnapshot {
  defaultList: LXSong[];
  loveList: LXSong[];
  userList: LXUserList[];
}

export function lxToApp(s: LXSong): SongItem {
  const m = s.meta || {};
  let songmid: string = String(s.id ?? m.songId ?? '');
  const prefix = `${s.source}_`;
  if (songmid.startsWith(prefix)) songmid = songmid.slice(prefix.length);
  return {
    name: s.name,
    singer: s.singer,
    source: s.source,
    songmid,
    albumId: '',
    interval: s.interval || '',
    albumName: m.albumName,
    img: m.picUrl,
    types: m.qualitys as SongItem['types'],
    _types: m._qualitys as SongItem['_types'],
  };
}

export function appToLx(s: SongItem): LXSong {
  return {
    id: `${s.source}_${s.songmid}`,
    name: s.name,
    singer: s.singer,
    source: s.source,
    interval: s.interval || '',
    meta: {
      songId: Number(s.songmid) || s.songmid,
      albumName: s.albumName,
      picUrl: s.img,
      qualitys: s.types,
      _qualitys: s._types,
    },
  };
}

export const sync = {
  /** lx104:上次快照缓存(MMKV)——冷启动侧栏/我的页秒出,后台刷新覆盖(大快照拉取慢=加载缓慢根因) */
  cachedLists(): UserListsSnapshot | null {
    try { return JSON.parse(kvSync.getString('snap') || 'null') as UserListsSnapshot | null; } catch { return null; }
  },
  async fetchLists(): Promise<UserListsSnapshot | null> {
    try {
      const d = (await req('/api/user/list', { timeout: 10000 })) as UserListsSnapshot;
      console.log('[sync] user/list resp type:', typeof d, '| defaultList:', Array.isArray((d as any)?.defaultList) ? (d as any).defaultList.length : String((d as any)?.defaultList).slice(0, 40));
      if (!d || !Array.isArray(d.defaultList)) return null;
      const snap = { defaultList: d.defaultList, loveList: d.loveList || [], userList: d.userList || [] };
      try { kvSync.set('snap', JSON.stringify(snap)); } catch { /* 超大忽略 */ }
      return snap;
    } catch (e) { console.log('[sync] fetchLists err:', (e as Error).message); return null; }
  },
  // lx101:歌单管理(双端共用)——服务器 userList 重命名/删除(fetch+改+push 整快照)
  // lx102/lx104:本机歌单上传服务器——同名歌单覆盖更新(防重复堆积)
  async uploadUserList(name: string, songs: SongItem[]): Promise<boolean> {
    const snap = await this.fetchLists(); if (!snap) return false;
    const exist = snap.userList.find(x => x.name === name);
    const entry = { id: exist?.id ?? `ul-${Date.now()}`, name, list: songs.map(appToLx) };
    snap.userList = exist
      ? snap.userList.map(x => (x.name === name ? entry : x))
      : [...snap.userList, entry];
    return this.pushLists(snap);
  },
  // lx106:服务器歌单移除单曲(收藏歌曲移除机制)
  async removeSongFromUserList(id: string, song: SongItem): Promise<boolean> {
    const snap = await this.fetchLists(); if (!snap) return false;
    const u = snap.userList.find(x => x.id === id); if (!u) return false;
    u.list = (u.list || []).filter(x => !(x.source === song.source && String(x.songmid) === String(song.songmid)));
    return this.pushLists(snap);
  },
  // lx107:本机歌单自动镜像(老板:同步是自动的)——一次 fetch 批量 upsert,一次 push;按名匹配,服务器独立歌单不动
  async mirrorLibrary(playlists: { name: string; songs: SongItem[] }[]): Promise<boolean> {
    const snap = await this.fetchLists(); if (!snap) return false;
    let changed = false;
    for (const pl of playlists) {
      const list = pl.songs.map(appToLx);
      const exist = snap.userList.find(x => x.name === pl.name);
      if (exist) {
        if (JSON.stringify(exist.list || []) !== JSON.stringify(list)) { exist.list = list; changed = true; }
      } else {
        snap.userList.push({ id: `ul-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: pl.name, list });
        changed = true;
      }
    }
    return changed ? this.pushLists(snap) : true;
  },
  async renameUserList(id: string, name: string): Promise<boolean> {
    const snap = await this.fetchLists(); if (!snap) return false;
    const u = snap.userList.find(x => x.id === id); if (!u) return false;
    u.name = name; return this.pushLists(snap);
  },
  async removeUserList(id: string): Promise<boolean> {
    const snap = await this.fetchLists(); if (!snap) return false;
    snap.userList = snap.userList.filter(x => x.id !== id); return this.pushLists(snap);
  },
  async pushLists(snap: UserListsSnapshot): Promise<boolean> {
    try {
      await req('/api/user/list', { method: 'POST', headers: { "Content-Type": "application/json" }, body: JSON.stringify(snap), timeout: 20000 });
      return true;
    } catch { return false; }
  },
  async libraryArtists(): Promise<{ name: string; id: string; img?: string; count?: number }[]> {
    try {
      const d = (await req('/api/user/library/artists')) as { list?: { name: string; id?: string; img?: string; count?: number }[] } | { name: string; id: string; img?: string; count?: number }[];
      const list = Array.isArray(d) ? d : d.list || [];
      return list.map(a => ({ name: a.name, id: String(a.id ?? a.name), img: a.img, count: a.count }));
    } catch { return []; }
  },
  async libraryAlbums(): Promise<{ name: string; singer?: string; id: string; img?: string }[]> {
    try {
      const d = (await req('/api/user/library/albums')) as { list?: { name: string; singer?: string; id?: string; img?: string }[] } | { name: string; singer?: string; id: string; img?: string }[];
      const list = Array.isArray(d) ? d : d.list || [];
      return list.map(a => ({ name: a.name, singer: a.singer, id: String(a.id ?? a.name), img: a.img }));
    } catch { return []; }
  },
};
