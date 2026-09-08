// lx101:HD 收藏统一 hook——与手机端同源(isFav+setFav+服务器 loveList 双向)
// 修 HD 收藏逻辑:此前取消收藏从不同步服务器,重拉即复活(与手机端表现不一致的根因)
import { useEffect, useState } from 'react';
import { isFav, setFav, subscribeFav } from './favorites';
import { library } from './library';
import { sync, subscribeSync, lxNormKey } from '../services/sync';
import { useApp } from './AppState';
import type { SongItem } from '../services/server';

export function useFav(song?: SongItem | null) {
  const { connected, token } = useApp();
  const [faved, setFaved] = useState(false);
  const [favTick, setFavTick] = useState(0);
  useEffect(() => subscribeFav(() => setFavTick(t => t + 1)), []); // lx108:收藏变更联动刷新
  useEffect(() => library.subscribe(() => setFavTick(t => t + 1)), []); // lx114:歌单收录也联动
  useEffect(() => subscribeSync(() => setFavTick(t => t + 1)), []); // lx117:服务器快照变更联动
  useEffect(() => {
    let dead = false;
    if (!song) return;
    // lx114(老板定夺):收藏语义=我喜欢的 OR 收录进任意歌单(本地/服务器)
    const key = `${song.source}_${song.songmid}`;
    // lx126 卡顿优化:改读缓存快照(每次收藏操作原来会触发 N 个 useFav 实例各拉一次全量快照——级联网络+多MB JSON 解析)
    // 缓存由任意一次 fetchLists 写入,push 后 bumpSync → syncTick → 本 effect 重跑即刷新
    const snap = sync.cachedLists();
    const check = (s2: typeof snap) => {
      const inRemotePl = (s2?.userList || []).some(u => (u.list || []).some((x: Parameters<typeof lxNormKey>[0]) => lxNormKey(x) === key));
      setFaved(isFav(song) || inLocalPl || (s2?.loveList || []).some(x => x.id === key) || inRemotePl);
    };
    const inLocalPl = library.all().some(pl => (pl.songs as SongItem[]).some(x => lxNormKey(x) === key));
    if (snap) check(snap);
    else if (connected && token) {
      sync.fetchLists().then(s => { if (!dead) check(s); }).catch(() => { if (!dead) setFaved(isFav(song) || inLocalPl); });
    } else setFaved(isFav(song) || inLocalPl);
    return () => { dead = true; };
  }, [song?.songmid, song?.source, connected, token, favTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async () => {
    if (!song) return;
    const next = !faved;
    setFaved(next);
    try {
      await setFav(song, next,
        connected && token ? ((snap: Parameters<typeof sync.pushLists>[0]) => sync.pushLists(snap)) : undefined,
        connected && token ? () => sync.fetchLists() : undefined);
    } catch { setFaved(!next); }
  };
  return { faved, toggle };
}
