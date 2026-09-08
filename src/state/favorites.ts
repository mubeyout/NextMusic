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
  // 本机「我喜欢的」歌单同步——lx124:仅收藏时确保歌单存在(取消收藏不再空建=幽灵空壳"删不掉"根因)
  try {
    let pl = library.all().find(p => p.name === '我喜欢的');
    if (!pl) {
      if (!on) { /* 无歌单且取消:跳过,不造空壳 */ }
      else pl = library.create('我喜欢的');
    }
    if (pl) {
      const songs = on
        ? [s, ...pl.songs.filter(x => songKey(x) !== k)]
        : pl.songs.filter(x => songKey(x) !== k);
      library.update(pl.id, { songs });
    }
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

// lx163:批量收藏(整单收藏)——一次写本地+一次推送服务器,避免逐首 N 次网络往返
export async function setFavBatch(songs: SongItem[], on: boolean, pushRemote?: (snap: any) => Promise<unknown>, fetchSnap?: () => Promise<any>, toLx?: (s: SongItem) => any): Promise<number> {
  const set = loadSet();
  let changed = 0;
  for (const s of songs) {
    const k = songKey(s);
    if (on ? !set.has(k) : set.has(k)) { if (on) set.add(k); else set.delete(k); changed++; }
  }
  kv.set(KEY, JSON.stringify([...set]));
  notifyFav();
  // 本机「我喜欢的」歌单同步
  try {
    let pl = library.all().find(p => p.name === '我喜欢的');
    if (!pl && on) pl = library.create('我喜欢的');
    if (pl) {
      const keys = new Set(songs.map(songKey));
      const merged = on
        ? [...songs.filter(s => !pl!.songs.some(x => songKey(x) === songKey(s))), ...pl.songs]
        : pl.songs.filter(x => !keys.has(songKey(x)));
      library.update(pl.id, { songs: merged });
    }
  } catch { /* ignore */ }
  // 服务器 loveList 一次推送(条目转 LX 形态,与 web 端一致)
  if (pushRemote && fetchSnap) {
    try {
      const snap = await fetchSnap();
      if (snap) {
        const keys = new Set(songs.map(songKey));
        const asLx = (s: SongItem) => (toLx ? toLx(s) : { id: songKey(s), ...s });
        snap.loveList = on
          ? [...songs.map(asLx), ...(snap.loveList || []).filter((x: { id?: string }) => !keys.has(x.id || ''))]
          : (snap.loveList || []).filter((x: { id?: string }) => !keys.has(x.id || ''));
        await pushRemote(snap);
      }
    } catch { /* ignore */ }
  }
  return changed;
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

// lx104/lx122:快捷收藏合并(离线补传)——⚠️ 已停用:原实现把原始 SongItem(无 id 字段)推入
// loveList,服务器接收后 remoteIds 恒不匹配→循环重推→loveList 指数膨胀(2026-09-06 实锤 1188 条)。
// 如需恢复:additions 必须映射为 {id: songKey(s), ...s} 且推送前按 id 去重。
export async function mergeLocalLove(): Promise<void> { /* disabled */ }

export function subscribeFav(f: () => void): () => void { favSubs.add(f); return () => { favSubs.delete(f); }; }
