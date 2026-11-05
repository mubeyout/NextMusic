// MediaTreeBridge.tsx —— [NM 内容树 1105] 内容树桥(PlayerProvider 内挂载)
// 职责:①监听原生点播事件→playSong(父容器队列上下文) ②启动/回前台节流推树
import React, { useEffect } from 'react';
import { Platform, DeviceEventEmitter, AppState } from 'react-native';
import { usePlayer } from '../state/PlayerProvider';
import { pushMediaTree, songOf, MEDIA_TREE_PLAY_EVENT } from '../services/mediaTree';

export function MediaTreeBridge() {
  const player = usePlayer();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // 点播:媒体中心 onAddMediaItems → JS 接管(队列上下文=父容器)
    const sub = DeviceEventEmitter.addListener(MEDIA_TREE_PLAY_EVENT, (e: { mediaId?: string }) => {
      const hit = e?.mediaId ? songOf(e.mediaId) : undefined;
      if (hit) void player.playSong(hit.song, hit.queue);
    });
    // 启动推树 + 回前台节流刷新
    void pushMediaTree(true);
    const appSub = AppState.addEventListener('change', s => { if (s === 'active') void pushMediaTree(); });
    return () => { sub.remove(); appSub.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
