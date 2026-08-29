// LX Server user-list sync: GET/POST /api/user/list (full snapshot restore)
// LX song format: {id:'wy_123', name, singer, source, interval, meta:{songId, albumName, picUrl, qualitys, _qualitys}}
// App SongItem:  {songmid, name, singer, source, interval, albumName, img, types, _types}
// NOTE: req() auto-injects x-user-token when logged in (see server.ts)
import { req, type SongItem } from './server';

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
  async fetchLists(): Promise<UserListsSnapshot | null> {
    try {
      const d = (await req('/api/user/list', { timeout: 10000 })) as UserListsSnapshot;
      console.log('[sync] user/list resp type:', typeof d, '| defaultList:', Array.isArray((d as any)?.defaultList) ? (d as any).defaultList.length : String((d as any)?.defaultList).slice(0, 40));
      if (!d || !Array.isArray(d.defaultList)) return null;
      return { defaultList: d.defaultList, loveList: d.loveList || [], userList: d.userList || [] };
    } catch (e) { console.log('[sync] fetchLists err:', (e as Error).message); return null; }
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
