// lx161:歌手收藏状态层——服务器 /api/user/library/artists 为真源(全量覆盖),
// 本地 MMKV 缓存 + 订阅联动;与 web 端多端互通(同一 API)
import { useEffect, useReducer } from 'react';
import { createMMKV } from 'react-native-mmkv';
import { sync } from '../services/sync';

export interface ArtistFav { name: string; id: string; source?: string; img?: string; count?: number }

const kv = createMMKV({ id: 'nextmusic-artist-favs' });
const KEY = 'artists';
const subs = new Set<() => void>();
function notify() { subs.forEach(f => f()); }

function load(): ArtistFav[] {
  try { return JSON.parse(kv.getString(KEY) || '[]') as ArtistFav[]; } catch { return []; }
}
function save(list: ArtistFav[]) {
  kv.set(KEY, JSON.stringify(list));
  notify();
}

export const aKey = (a: { id: string; source?: string }) => `${a.source || 'wy'}_${a.id}`;

export function artistFavs(): ArtistFav[] { return load(); }
export function isArtistFav(a: { id: string; source?: string }): boolean {
  const k = aKey(a);
  return load().some(x => aKey(x) === k);
}

/** 拉取服务器列表并更新缓存(登录态;失败时保留缓存) */
export async function refreshArtistFavs(): Promise<ArtistFav[]> {
  const list = await sync.libraryArtists();
  if (list.length || load().length) save(list);
  return list;
}

/** 收藏/取消(服务器全量写回+本地缓存即时更新);未登录抛错由调用方提示 */
export async function toggleArtistFav(a: ArtistFav): Promise<boolean> {
  const list = load();
  const k = aKey(a);
  const idx = list.findIndex(x => aKey(x) === k);
  const next = idx >= 0 ? list.filter(x => aKey(x) !== k) : [{ ...a, source: a.source || 'wy' }, ...list];
  save(next); // 先本地生效(乐观),再服务器
  const ok = await sync.pushLibraryArtists(next);
  if (!ok) { save(list); throw new Error('服务器写入失败'); }
  return idx < 0;
}

export function subscribeArtistFavs(f: () => void): () => void {
  subs.add(f);
  return () => { subs.delete(f); };
}

/** 组件内订阅刷新 hook(任意收藏变更触发重渲染) */
export function useArtistFavTick(): number {
  const [tick, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeArtistFavs(() => bump()), []); // eslint-disable-line react-hooks/exhaustive-deps
  return tick;
}
