// lx163:收藏专辑状态层——服务器 /api/user/library/albums 为真源(全量覆盖),与 artistFavs 同构
import { useEffect, useReducer } from 'react';
import { createMMKV } from 'react-native-mmkv';
import { sync } from '../services/sync';

export interface AlbumFav { name: string; singer?: string; id: string; source?: string; img?: string }

const kv = createMMKV({ id: 'nextmusic-album-favs' });
const KEY = '***';
const subs = new Set<() => void>();
function notify() { subs.forEach(f => f()); }
function load(): AlbumFav[] {
  try { return JSON.parse(kv.getString(KEY) || '[]') as AlbumFav[]; } catch { return []; }
}
function save(list: AlbumFav[]) { kv.set(KEY, JSON.stringify(list)); notify(); }

export const alKey = (a: { id: string; source?: string }) => `${a.source || 'wy'}_${a.id}`;
export function albumFavs(): AlbumFav[] { return load(); }
export function isAlbumFav(a: { id: string; source?: string }): boolean {
  const k = alKey(a);
  return load().some(x => alKey(x) === k);
}
export async function refreshAlbumFavs(): Promise<AlbumFav[]> {
  const list = await sync.libraryAlbums();
  const norm = list.map(a => ({ name: a.name, singer: a.singer, id: a.id, img: a.img }));
  if (norm.length || load().length) save(norm);
  return norm;
}
export async function toggleAlbumFav(a: AlbumFav): Promise<boolean> {
  const list = load();
  const k = alKey(a);
  const idx = list.findIndex(x => alKey(x) === k);
  const next = idx >= 0 ? list.filter(x => alKey(x) !== k) : [{ ...a, source: a.source || 'wy' }, ...list];
  save(next);
  const ok = await sync.pushLibraryAlbums(next);
  if (!ok) { save(list); throw new Error('服务器写入失败'); }
  return idx < 0;
}
export function subscribeAlbumFavs(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}
export function useAlbumFavTick(): number {
  const [tick, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeAlbumFavs(() => bump()), []); // eslint-disable-line react-hooks/exhaustive-deps
  return tick;
}
