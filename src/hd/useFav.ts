// lx101:HD 收藏统一 hook——与手机端同源(isFav+setFav+服务器 loveList 双向)
// 修 HD 收藏逻辑:此前取消收藏从不同步服务器,重拉即复活(与手机端表现不一致的根因)
import { useEffect, useState } from 'react';
import { isFav, setFav, subscribeFav } from '../state/favorites';
import { library } from '../state/library';
import { sync, subscribeSync, lxNormKey } from '../services/sync';
import { useApp } from '../state/AppState';
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
    const inLocalPl = library.all().some(pl => (pl.songs as SongItem[]).some(x => lxNormKey(x) === key));
    const base = isFav(song) || inLocalPl;
    if (connected && token) {
      sync.fetchLists().then(s => {
        if (dead || !s) return;
        const inRemotePl = (s.userList || []).some(u => (u.list || []).some((x: Parameters<typeof lxNormKey>[0]) => lxNormKey(x) === key)); // lx117:归一比对
        setFaved(base || s.loveList.some(x => x.id === key) || inRemotePl);
      }).catch(() => { if (!dead) setFaved(base); });
    } else setFaved(base);
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
