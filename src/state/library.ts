// Local library: user playlists persisted in MMKV (works offline / local mode)
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from '../services/server';

export interface LocalPlaylist {
  id: string;
  name: string;
  createdAt: number;
  source?: string;       // imported platform: wy/tx/kg/kw/mg
  remoteId?: string;     // platform playlist id for re-sync
  // 导入自第三方媒体库（emby/webdav/...）时记录来源，用于断连状态展示与复活机制
  providerType?: string;
  providerName?: string;
  providerId?: string;
  desc?: string;
  cover?: string;
  songs: SongItem[];
}

const kv = createMMKV({ id: 'nextmusic-library' });

function readAll(): LocalPlaylist[] {
  try { return JSON.parse(kv.getString('playlists') || '[]'); } catch { return []; }
}

// 变更订阅：让「我的」页等界面在导入/新建/删除后实时刷新
 type Sub = () => void;
const subs = new Set<Sub>();
function writeAll(list: LocalPlaylist[]) {
  kv.set('playlists', JSON.stringify(list));
  subs.forEach(f => f());
}

let uid = Date.now();
export const library = {
  all: readAll,
  subscribe(f: Sub): () => void { subs.add(f); return () => { subs.delete(f); }; },
  get(id: string) { return readAll().find(p => p.id === id); },
  create(name: string, songs: SongItem[] = [], meta: Partial<LocalPlaylist> = {}): LocalPlaylist {
    const list = readAll();
    const pl: LocalPlaylist = { id: `pl-${++uid}`, name, createdAt: Date.now(), songs, ...meta };
    list.unshift(pl);
    writeAll(list);
    return pl;
  },
  update(id: string, patch: Partial<LocalPlaylist>) {
    const list = readAll();
    const i = list.findIndex(p => p.id === id);
    if (i < 0) return;
    list[i] = { ...list[i], ...patch };
    writeAll(list);
  },
  remove(id: string) {
    writeAll(readAll().filter(p => p.id !== id));
  },
  addSongs(id: string, songs: SongItem[]) {
    const list = readAll();
    const i = list.findIndex(p => p.id === id);
    if (i < 0) return;
    const exist = new Set(list[i].songs.map(s => `${s.source}:${s.songmid}`));
    const add = songs.filter(s => !exist.has(`${s.source}:${s.songmid}`));
    list[i].songs = [...list[i].songs, ...add];
    writeAll(list);
  },
  // 从歌单移除单曲（按 source:songmid 匹配）
  removeSong(id: string, song: SongItem) {
    const list = readAll();
    const i = list.findIndex(p => p.id === id);
    if (i < 0) return;
    const key = `${song.source}:${song.songmid}`;
    list[i].songs = list[i].songs.filter(s => `${s.source}:${s.songmid}` !== key);
    writeAll(list);
  },
  // 重新同步：全量覆盖歌曲（保留名称/封面等元数据）
  replaceSongs(id: string, songs: SongItem[]) {
    this.update(id, { songs });
  },
  // 依赖某媒体库账号的已导入歌曲数（删除账号前的影响提示用）：webdav 歌曲以 base 前缀匹配，其余以 "pid:" 前缀匹配
  dependentSongCount(acct: { id: string; type: string; base: string }): number {
    const pre = acct.type === 'webdav'
      ? acct.base.trim().replace(/\/+$/, '')
      : `${acct.id}:`;
    return readAll().reduce((n, pl) => n + pl.songs.filter(s =>
      s.source === acct.type && String(s.songmid ?? '').startsWith(pre)
    ).length, 0);
  },
};
