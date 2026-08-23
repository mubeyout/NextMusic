// Recent plays: local MMKV ring (max 100), dedup by source+songmid
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from '../services/server';

const kv = createMMKV({ id: 'nextmusic-recent' });
const MAX = 100;

export function getRecents(): SongItem[] {
  try { return JSON.parse(kv.getString('recent') || '[]'); } catch { return []; }
}

export function pushRecent(song: SongItem): void {
  let list = getRecents();
  const key = `${song.source}:${song.songmid}`;
  list = list.filter(s => `${s.source}:${s.songmid}` !== key);
  list.unshift(song);
  if (list.length > MAX) list = list.slice(0, MAX);
  kv.set('recent', JSON.stringify(list));
}
