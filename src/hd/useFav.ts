// lx101:HD 收藏统一 hook——与手机端同源(isFav+setFav+服务器 loveList 双向)
// 修 HD 收藏逻辑:此前取消收藏从不同步服务器,重拉即复活(与手机端表现不一致的根因)
import { useEffect, useState } from 'react';
import { isFav, setFav } from '../state/favorites';
import { sync } from '../services/sync';
import { useApp } from '../state/AppState';
import type { SongItem } from '../services/server';

export function useFav(song?: SongItem | null) {
  const { connected, token } = useApp();
  const [faved, setFaved] = useState(false);
  useEffect(() => {
    let dead = false;
    if (!song) return;
    const base = isFav(song);
    if (connected && token) {
      sync.fetchLists().then(s => {
        if (dead || !s) return;
        setFaved(base || s.loveList.some(x => x.id === `${song.source}_${song.songmid}`));
      }).catch(() => { if (!dead) setFaved(base); });
    } else setFaved(base);
    return () => { dead = true; };
  }, [song?.songmid, song?.source, connected, token]); // eslint-disable-line react-hooks/exhaustive-deps

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
