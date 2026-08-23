// Local library: user playlists persisted in MMKV (works offline / local mode)
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from '../services/server';

export interface LocalPlaylist {
  id: string;
  name: string;
  createdAt: number;
  source?: string;       // imported platform: wy/tx/kg/kw/mg
  remoteId?: string;     // platform playlist id for re-sync
  desc?: string;
  cover?: string;
  songs: SongItem[];
}

const kv = createMMKV({ id: 'nextmusic-library' });

function readAll(): LocalPlaylist[] {
  try { return JSON.parse(kv.getString('playlists') || '[]'); } catch { return []; }
}
function writeAll(list: LocalPlaylist[]) {
  kv.set('playlists', JSON.stringify(list));
}

let uid = Date.now();
export const library = {
  all: readAll,
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
};
