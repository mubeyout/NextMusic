// 本机收藏状态（MMKV set），登录时双向同步服务器 loveList
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from '../services/server';
import { library } from './library';

const kv = createMMKV({ id: 'nextmusic-fav' });
const KEY = 'favs';

function loadSet(): Set<string> {
  try { return new Set(JSON.parse(kv.getString(KEY) || '[]') as string[]); } catch { return new Set(); }
}
export const songKey = (s: SongItem) => `${s.source}_${s.songmid}`;

export function isFav(s: SongItem): boolean {
  return loadSet().has(songKey(s));
}

export async function setFav(s: SongItem, on: boolean, pushRemote?: (snap: any) => Promise<unknown>, fetchSnap?: () => Promise<any>): Promise<void> {
  const set = loadSet();
  const k = songKey(s);
  if (on) set.add(k); else set.delete(k);
  kv.set(KEY, JSON.stringify([...set]));
  // 本机「我喜欢的」歌单同步
  try {
    let pl = library.all().find(p => p.name === '我喜欢的');
    if (!pl) pl = library.create('我喜欢的');
    const songs = on
      ? [s, ...pl.songs.filter(x => songKey(x) !== k)]
      : pl.songs.filter(x => songKey(x) !== k);
    library.update(pl.id, { songs });
  } catch { /* ignore */ }
  // 服务器 loveList 同步（登录时）
  if (on && pushRemote && fetchSnap) {
    try {
      const snap = await fetchSnap();
      if (snap && !snap.loveList.some((x: { id: string }) => x.id === k)) {
        snap.loveList.unshift(s);
        await pushRemote(snap);
      }
    } catch { /* ignore */ }
  }
}

// 收藏到任意歌单：登录 → 服务器 userList；未登录 → 本机歌单
export async function addToPlaylist(plKey: 'love' | { id: string } | { name: string }, song: SongItem, fetchSnap?: () => Promise<any>, pushSnap?: (s: any) => Promise<unknown>): Promise<void> {
  if (plKey === 'love') return setFav(song, true, pushSnap, fetchSnap);
  if ('id' in plKey) {
    // 本机歌单
    const pl = library.all().find(p => p.id === plKey.id);
    if (pl) library.update(pl.id, { songs: [song, ...pl.songs.filter(x => songKey(x) !== songKey(song))] });
  } else if ('name' in plKey && fetchSnap && pushSnap) {
    // 服务器自建歌单（按名字匹配）
    try {
      const snap = await fetchSnap();
      const u = snap?.userList?.find((x: { name: string }) => x.name === plKey.name);
      if (u) {
        u.list = [song, ...(u.list || []).filter((x: SongItem) => songKey(x) !== songKey(song))];
        await pushSnap(snap);
      }
    } catch { /* ignore */ }
  }
}

// 备份/恢复用：收藏 key 快照读写（vc81）
export function readKeys(): string[] { return [...loadSet()]; }
export function writeKeys(keys: string[]): void { kv.set(KEY, JSON.stringify(keys)); }
