// 本机收藏状态（MMKV set），登录时双向同步服务器 loveList
import { createMMKV } from 'react-native-mmkv';
import type { SongItem } from '../services/server';
import { library } from './library';
import { sync, appToLx, lxNormKey } from '../services/sync'; // lx164:归一工具直接用(不再把无 id 的原始 SongItem 推上服务器)

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
  // 听风歌曲：收藏/取消联动听风用户库「我喜欢的音乐」（fire-and-forget，与听风 web 端双向）
  if (s.source === 'tf') void import('../services/tingfeng').then(m => m.tfToggleLiked(s, on)).catch(() => {});
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
  // lx122 修复(2026-09-19):推入条目一律 appToLx 归一(带 id),比对一律 lxNormKey——
  // 原先 unshift 原始 SongItem(无 id),服务器收下后 has 恒 false→重推复制+取消收藏删不掉(存量 1187 条无 id 实锤)
  // lx164:离线失败不再静默丢——入离线队列,恢复连接补传;乐观变更落缓存重启仍可见
  if (pushRemote && fetchSnap) {
    const key = lxNormKey(s as never);
    const enqueue = (on2: boolean) => {
      void import('../services/offlineQueue').then(m => m.offlineQueue.enqueue(on2 ? { k: 'love', song: s } : { k: 'unlove', key })).catch(() => {});
    };
    try {
      const snap = await fetchSnap();
      if (snap) {
        const has = (snap.loveList || []).some((x: { id?: string }) => lxNormKey(x as never) === key);
        if (on && !has) snap.loveList = [appToLx(s), ...(snap.loveList || [])];
        else if (!on && has) snap.loveList = (snap.loveList || []).filter((x: { id?: string }) => lxNormKey(x as never) !== key);
        else return;
        const ok = await pushRemote(snap);
        if (!ok) { sync.persistSnap(snap); enqueue(on); }
      } else {
        enqueue(on); // 无缓存可改:直接排队(重放时从服务器快照补)
      }
    } catch { enqueue(on); }
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
  // 听风歌曲批量收藏同样联动（逐首 fire-and-forget，内部 tfLikeBusy 串行防互踩）
  for (const s of songs) {
    if (s.source === 'tf') void import('../services/tingfeng').then(m => m.tfToggleLiked(s, on)).catch(() => {});
  }
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
  // lx164:离线失败→批量入离线队列(重放合并为一次 fetch+push);lx122:一律 appToLx 归一带 id
  if (pushRemote && fetchSnap) {
    const songs2 = songs;
    const keys = songs.map(songKey);
    const enqueue2 = () => {
      void import('../services/offlineQueue').then(m => m.offlineQueue.enqueue(on ? { k: 'loveMany', songs: songs2 } : { k: 'unloveMany', keys })).catch(() => {});
    };
    try {
      const snap = await fetchSnap();
      if (!snap) { enqueue2(); return changed; }
      const asLx = (s: SongItem) => appToLx(s);
      const ks = new Set(keys);
      snap.loveList = on
        ? [...songs.map(asLx), ...(snap.loveList || []).filter((x: { id?: string }) => !ks.has(x.id || ''))]
        : (snap.loveList || []).filter((x: { id?: string }) => !ks.has(x.id || ''));
      const ok = await pushRemote(snap);
      if (!ok) { sync.persistSnap(snap); enqueue2(); }
    } catch { enqueue2(); }
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
    // 服务器自建歌单（按名字匹配）lx122/lx164:归一推入+离线入队
    const key = lxNormKey(song as never);
    const enqueue3 = () => { void import('../services/offlineQueue').then(m => m.offlineQueue.enqueue({ k: 'plAdd', name: (plKey as { name: string }).name, songs: [song] })).catch(() => {}); };
    try {
      const snap = await fetchSnap();
      const u = snap?.userList?.find((x: { name: string }) => x.name === (plKey as { name: string }).name);
      if (u) {
        u.list = [appToLx(song), ...(u.list || []).filter((x: SongItem) => lxNormKey(x as never) !== key)];
        const ok = await pushSnap(snap);
        if (!ok) { sync.persistSnap(snap); enqueue3(); }
      } else {
        enqueue3(); // 服务器无此列表:排队(plAdd 重放时无则建)
      }
    } catch { enqueue3(); }
  }
}

// 备份/恢复用：收藏 key 快照读写（vc81）
export function readKeys(): string[] { return [...loadSet()]; }
export function writeKeys(keys: string[]): void { kv.set(KEY, JSON.stringify(keys)); }

// lx104/lx122:快捷收藏合并(离线补传)——⚠️ 已停用:原实现把原始 SongItem(无 id 字段)推入
// loveList,服务器接收后 remoteIds 恒不匹配→循环重推→loveList 指数膨胀(2026-09-06 实锤 1188 条)。
// 如需恢复:additions 必须映射为 {id: songKey(s), ...s} 且推送前按 id 去重。
export async function mergeLocalLove(): Promise<void> { /* disabled */ }

// lx164:仅「移除服务器/退出账号」可调(disconnectServer)——清收藏 key 集与本机「我喜欢的」镜像歌单
export function clearFavs(): void {
  kv.set(KEY, '[]');
  notifyFav();
  try {
    const pl = library.all().find(p => p.name === '我喜欢的');
    if (pl) library.remove(pl.id);
  } catch { /* ignore */ }
}

export function subscribeFav(f: () => void): () => void { favSubs.add(f); return () => { favSubs.delete(f); }; }
