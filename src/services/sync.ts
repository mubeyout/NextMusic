// LX Server user-list sync: GET/POST /api/user/list (full snapshot restore)
// LX song format: {id:'wy_123', name, singer, source, interval, meta:{songId, albumName, picUrl, qualitys, _qualitys}}
// App SongItem:  {songmid, name, singer, source, interval, albumName, img, types, _types}
// NOTE: req() auto-injects x-user-token when logged in (see server.ts)
import { req, type SongItem } from './server';
import { createMMKV } from 'react-native-mmkv';
export const kvSync = createMMKV({ id: 'nextmusic-sync-cache' }); // lx165:导出供 dedupLove 存完成标记
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
// lx163:前台全量拉取并广播——服务器侧或他端操作后回前台即同步(双向闭环的拉半边)
export async function refetchAndBump(): Promise<void> {
  try { await sync.fetchLists(); } catch { /* ignore */ }
  bumpSync();
}
function bumpSync() { syncSubs.forEach(f => f()); }

// lx164:离线入队小助手(动态 import 防 sync↔offlineQueue 静态环)
function queueOffline(op: import('./offlineQueue').OutboxInput): void {
  void import('./offlineQueue').then(m => m.offlineQueue.enqueue(op)).catch(() => {});
}

export const sync = {
  /** lx104:上次快照缓存(MMKV)——冷启动侧栏/我的页秒出,后台刷新覆盖(大快照拉取慢=加载缓慢根因) */
  _snapCache: undefined as UserListsSnapshot | null | undefined, // lx163h:快照解析缓存(与 lastSnapJson 绑定);#029:必须 init undefined——null 会让 cachedLists 的「未解析」守卫短路,冷启动永远读不到 MMKV 盘缓存(离线冷启动 0/0 根因)
  cachedLists(): UserListsSnapshot | null {
    if (this._snapCache !== undefined) return this._snapCache; // undefined=未解析,null=无快照
    try { this._snapCache = JSON.parse(kvSync.getString('snap') || 'null') as UserListsSnapshot | null; } catch { this._snapCache = null; }
    return this._snapCache;
  },
  _lastFetchAt: 0, // lx163h:拉取 TTL——前台切换/多界面并发不再人人打服务器
  async fetchLists(opts?: { force?: boolean }): Promise<UserListsSnapshot | null> {
    // 20s 内有人拉过且内容非空→直接复用(手动刷新传 force)
    if (!opts?.force && Date.now() - this._lastFetchAt < 20000) {
      const c = this.cachedLists();
      if (c && (c.defaultList?.length || c.userList?.length)) return c;
    }
    try {
      const d = (await req('/api/user/list', { timeout: 10000 })) as UserListsSnapshot;
      console.log('[sync] user/list resp type:', typeof d, '| defaultList:', Array.isArray((d as any)?.defaultList) ? (d as any).defaultList.length : String((d as any)?.defaultList).slice(0, 40));
      // lx164:不可达/响应异常回退缓存——展示与读路径离线可见(离开内网数据消失根因);
      // 写路径靠 pushLists 失败入离线队列,不会把本地缓存误推上服务器
      if (!d || !Array.isArray(d.defaultList)) return this.cachedLists();
      const snap = { defaultList: d.defaultList, loveList: d.loveList || [], userList: d.userList || [] };
      // lx126 卡顿优化:内容未变跳过 MB 级 stringify+MMKV 写(全量快照 400+ 歌时 JS 线程卡顿源)
      try {
        const json = JSON.stringify(snap);
        if (json !== lastSnapJson) { kvSync.set('snap', json); lastSnapJson = json; this._snapCache = snap; }
      } catch { /* 超大忽略 */ }
      this._lastFetchAt = Date.now();
      return snap;
    } catch { return this.cachedLists(); }
  },
  // lx164:离线乐观变更落缓存——重启后仍可见(未推上服务器的本地态)
  persistSnap(snap: UserListsSnapshot): void {
    try {
      const json = JSON.stringify(snap);
      if (json !== lastSnapJson) { kvSync.set('snap', json); lastSnapJson = json; this._snapCache = snap; }
    } catch { /* 超大忽略 */ }
  },
  // lx164:清同步缓存——仅 disconnectServer(移除服务器/退出账号)这一个入口允许调
  clearCache(): void { kvSync.remove('snap'); lastSnapJson = ''; this._snapCache = null; },
  // lx101:歌单管理(双端共用)——服务器 userList 重命名/删除(fetch+改+push 整快照)
  // lx102/lx104:本机歌单上传服务器——同名歌单覆盖更新(防重复堆积)
  async uploadUserList(name: string, songs: SongItem[]): Promise<boolean> {
    const snap = await this.fetchLists(); if (!snap) return false;
    const exist = snap.userList.find(x => x.name === name);
    const entry = { id: exist?.id ?? `ul-${Date.now()}`, name, list: songs.map(appToLx) };
    snap.userList = exist
      ? snap.userList.map(x => (x.name === name ? entry : x))
      : [...snap.userList, entry];
    const ok = await this.pushLists(snap);
    if (!ok) { this.persistSnap(snap); queueOffline({ k: 'plUpload', name, songs }); return true; } // lx164:离线保存待补传
    return true;
  },
  // lx106:服务器歌单移除单曲(收藏歌曲移除机制)
  async removeSongFromUserList(id: string, song: SongItem): Promise<boolean> {
    const snap = await this.fetchLists(); if (!snap) return false;
    const u = snap.userList.find(x => x.id === id); if (!u) return false;
    u.list = (u.list || []).filter(x => lxNormKey(x as never) !== lxNormKey(song));
    const ok = await this.pushLists(snap);
    if (!ok) { this.persistSnap(snap); queueOffline({ k: 'plDelSong', id, name: u.name, key: lxNormKey(song) }); return true; }
    return true;
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
    const ok = await this.pushLists(snap);
    if (!ok) { this.persistSnap(snap); queueOffline({ k: 'plDelSong', name: plName, key: lxNormKey(song) }); return true; }
    return true;
  },
  async renameUserList(id: string, name: string): Promise<boolean> {
    const snap = await this.fetchLists(); if (!snap) return false;
    const u = snap.userList.find(x => x.id === id); if (!u) return false;
    u.name = name;
    const ok = await this.pushLists(snap);
    if (!ok) { this.persistSnap(snap); queueOffline({ k: 'plRename', id, name: u.name, newName: name }); return true; }
    return true;
  },
  async removeUserList(id: string): Promise<boolean> {
    const snap = await this.fetchLists(); if (!snap) return false;
    const u = snap.userList.find(x => x.id === id);
    snap.userList = snap.userList.filter(x => x.id !== id);
    const ok = await this.pushLists(snap);
    if (!ok) { this.persistSnap(snap); if (u) queueOffline({ k: 'plRemove', id, name: u.name }); return true; }
    return true;
  },
  async pushLists(snap: UserListsSnapshot): Promise<boolean> {
    try {
      await req('/api/user/list', { method: 'POST', headers: { "Content-Type": "application/json" }, body: JSON.stringify(snap), timeout: 20000 });
      bumpSync();
      return true;
    } catch { return false; }
  },
  async libraryArtists(): Promise<{ name: string; id: string; source?: string; img?: string; count?: number }[] | null> {
    try {
      const d = (await req('/api/user/library/artists')) as { list?: { name: string; id?: string; source?: string; img?: string; count?: number }[] } | { name: string; id?: string; source?: string; img?: string; count?: number }[];
      const list = Array.isArray(d) ? d : d.list || [];
      return list.map(a => ({ name: a.name, id: String(a.id ?? a.name), source: a.source, img: a.img, count: a.count }));
    } catch { return null; } // lx164:null=拉取失败(区别于空列表)——调用方保缓存不清空
  },
  // lx161:歌手收藏写入(服务器 API 为全量覆盖)——web 端同款接口,多端互通
  async pushLibraryArtists(list: { name: string; id: string; source?: string; img?: string; count?: number }[]): Promise<boolean> {
    try {
      await req('/api/user/library/artists', { method: 'POST', headers: { "Content-Type": "application/json" }, body: JSON.stringify(list), timeout: 15000 });
      return true;
    } catch { return false; }
  },
  // lx163:专辑收藏写入(全量覆盖)——与 artists 同模式多端互通
  async pushLibraryAlbums(list: { name: string; singer?: string; id: string; source?: string; img?: string }[]): Promise<boolean> {
    try {
      await req('/api/user/library/albums', { method: 'POST', headers: { "Content-Type": "application/json" }, body: JSON.stringify(list), timeout: 15000 });
      return true;
    } catch { return false; }
  },
  async libraryAlbums(): Promise<{ name: string; singer?: string; id: string; img?: string }[] | null> {
    try {
      const d = (await req('/api/user/library/albums')) as { list?: { name: string; singer?: string; id?: string; img?: string }[] } | { name: string; singer?: string; id: string; img?: string }[];
      const list = Array.isArray(d) ? d : d.list || [];
      return list.map(a => ({ name: a.name, singer: a.singer, id: String(a.id ?? a.name), img: a.img }));
    } catch { return null; } // lx164:同 libraryArtists——null 保缓存
  },
};
