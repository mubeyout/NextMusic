// 本机收藏状态（MMKV set），登录时双向同步服务器 loveList
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from '../services/server';
import { library } from './library';

const kv = createMMKV({ id: 'nextmusic-fav' });
const KEY = 'favs';

// lx108:变更订阅——收藏状态实时反馈(播放页/播放条/MiniPlayer 各自实例联动)
 type FavSub = () => void;
const favSubs = new Set<FavSub>();
function notifyFav() { favSubs.forEach(f => f()); }

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
  notifyFav();
  // 本机「我喜欢的」歌单同步
  try {
    let pl = library.all().find(p => p.name === '我喜欢的');
    if (!pl) pl = library.create('我喜欢的');
    const songs = on
      ? [s, ...pl.songs.filter(x => songKey(x) !== k)]
      : pl.songs.filter(x => songKey(x) !== k);
    library.update(pl.id, { songs });
  } catch { /* ignore */ }
  // 服务器 loveList 双向同步（登录时）——lx101 修复:取消收藏也从服务器移除(原先只加不减,HD/手机取消后重拉又复活)
  if (pushRemote && fetchSnap) {
    try {
      const snap = await fetchSnap();
      if (snap) {
        const has = snap.loveList.some((x: { id: string }) => x.id === k);
        if (on && !has) { snap.loveList.unshift(s); await pushRemote(snap); }
        else if (!on && has) { snap.loveList = snap.loveList.filter((x: { id: string }) => x.id !== k); await pushRemote(snap); }
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

// lx104:快捷收藏合并——离线期间攒的本地收藏,登录后补传服务器 loveList(单向补齐,幂等)
export async function mergeLocalLove(pushRemote?: (snap: any) => Promise<unknown>, fetchSnap?: () => Promise<any>): Promise<void> {
  if (!pushRemote || !fetchSnap) return;
  try {
    const snap = await fetchSnap();
    if (!snap) return;
    const localSet = loadSet();
    const remoteIds = new Set((snap.loveList || []).map((x: { id: string }) => x.id));
    // 本地库「我喜欢的」歌单也并入(双入口同源)
    let pl = library.all().find(q => q.name === '我喜欢的');
    const keys = new Set(localSet);
    (pl?.songs || []).forEach(q => keys.add(songKey(q)));
    const missing = [...keys].filter(k => !remoteIds.has(k));
    if (!missing.length) return;
    const byKey = new Map<string, SongItem>();
    (pl?.songs || []).forEach(q => byKey.set(songKey(q), q));
    // loveList 快照里存有完整歌曲的从远端取,本地库没有的从 loveList 已有项找
    (snap.loveList || []).forEach((x: { id: string }) => remoteIds.has(x.id));
    const additions = missing.map(k => byKey.get(k) || ({ id: k, source: k.split('_')[0], songmid: k.split('_').slice(1).join('_'), name: '', singer: '' } as never));
    snap.loveList = [...additions, ...(snap.loveList || [])];
    await pushRemote(snap);
    console.log('[fav] merged local love -> server:', missing.length);
  } catch { /* ignore */ }
}

export function subscribeFav(f: () => void): () => void { favSubs.add(f); return () => { favSubs.delete(f); }; }
