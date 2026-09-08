// LX Server user-list sync: GET/POST /api/user/list (full snapshot restore)
// LX song format: {id:'wy_123', name, singer, source, interval, meta:{songId, albumName, picUrl, qualitys, _qualitys}}
// App SongItem:  {songmid, name, singer, source, interval, albumName, img, types, _types}
// NOTE: req() auto-injects x-user-token when logged in (see server.ts)
import { req, type SongItem } from './server';
import { createMMKV } from 'react-native-mmkv';
const kvSync = createMMKV({ id: 'nextmusic-sync-cache' });
let lastSnapJson = ''; // lx126:缓存写入去重(避免重复 MB 级序列化)

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

// lx121:平台导入歌单判定(id 前缀 tx_/wy_/kg_/kw_...)——服务器自动从源平台恢复,写操作不持久
export function isPlatformList(id?: string): boolean {
  return !!id && /^[a-z]{2}_/.test(id);
}

// lx117:服务器快照歌曲 id 带 source_ 前缀(kw_xxx),App 内 songmid 是剥前缀的——比对必须归一
export function lxNormKey(x: { source?: string; id?: string | number; songmid?: string | number }): string {
  const src = x.source || '';
  let mid = String(x.id ?? x.songmid ?? '');
  const pfx = `${src}_`;
  if (mid.startsWith(pfx)) mid = mid.slice(pfx.length);
  return `${src}_${mid}`;
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

// lx117:快照版本通知——push/fetch 后 bump,消费方联动刷新
 type SyncSub = () => void;
const syncSubs = new Set<SyncSub>();
export function subscribeSync(f: SyncSub): () => void { syncSubs.add(f); return () => { syncSubs.delete(f); }; }
function bumpSync() { syncSubs.forEach(f => f()); }

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
      // lx126 卡顿优化:内容未变跳过 MB 级 stringify+MMKV 写(全量快照 400+ 歌时 JS 线程卡顿源)
      try {
        const json = JSON.stringify(snap);
        if (json !== lastSnapJson) { kvSync.set('snap', json); lastSnapJson = json; }
      } catch { /* 超大忽略 */ }
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
    u.list = (u.list || []).filter(x => lxNormKey(x as never) !== lxNormKey(song));
    return this.pushLists(snap);
  },
  // lx107/lx119:本机歌单自动镜像——只"新增"本地独有歌单;服务器已存在同名一律不碰
  // (lx119:即使调用方过滤失效,这里也是最后防线——同名覆盖=服务器侧删改被本地旧副本复活)
  async mirrorLibrary(playlists: { name: string; songs: SongItem[] }[]): Promise<boolean> {
    const snap = await this.fetchLists(); if (!snap) return false;
    let changed = false;
    for (const pl of playlists) {
      if (snap.userList.some(x => x.name === pl.name)) continue; // 服务器已有同名:跳过,永不覆盖
      snap.userList.push({ id: `ul-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: pl.name, list: pl.songs.map(appToLx) });
      changed = true;
    }
    return changed ? this.pushLists(snap) : true;
  },
  // lx116:按歌单名移除歌曲(从任意入口打开的收藏歌单,无 plKey 时兜底)
  async removeSongFromUserListByName(plName: string, song: SongItem): Promise<boolean> {
    const snap = await this.fetchLists(); if (!snap) return false;
    const u = snap.userList.find(x => x.name === plName); if (!u) return false;
    u.list = (u.list || []).filter(x => lxNormKey(x as never) !== lxNormKey(song));
    return this.pushLists(snap);
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
      bumpSync();
      return true;
    } catch { return false; }
  },
  async libraryArtists(): Promise<{ name: string; id: string; source?: string; img?: string; count?: number }[]> {
    try {
      const d = (await req('/api/user/library/artists')) as { list?: { name: string; id?: string; source?: string; img?: string; count?: number }[] } | { name: string; id?: string; source?: string; img?: string; count?: number }[];
      const list = Array.isArray(d) ? d : d.list || [];
      return list.map(a => ({ name: a.name, id: String(a.id ?? a.name), source: a.source, img: a.img, count: a.count }));
    } catch { return []; }
  },
  // lx161:歌手收藏写入(服务器 API 为全量覆盖)——web 端同款接口,多端互通
  async pushLibraryArtists(list: { name: string; id: string; source?: string; img?: string; count?: number }[]): Promise<boolean> {
    try {
      await req('/api/user/library/artists', { method: 'POST', headers: { "Content-Type": "application/json" }, body: JSON.stringify(list), timeout: 15000 });
      return true;
    } catch { return false; }
  },
  async libraryAlbums(): Promise<{ name: string; singer?: string; id: string; img?: string }[]> {
    try {
      const d = (await req('/api/user/library/albums')) as { list?: { name: string; singer?: string; id?: string; img?: string }[] } | { name: string; singer?: string; id: string; img?: string }[];
      const list = Array.isArray(d) ? d : d.list || [];
      return list.map(a => ({ name: a.name, singer: a.singer, id: String(a.id ?? a.name), img: a.img }));
    } catch { return []; }
  },
};
