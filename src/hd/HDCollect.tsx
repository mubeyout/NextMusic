// lx103:HD 收藏到歌单面板(共享组件)——播放页收藏键/播放条收藏键统一行为:点按弹此面板选目标
// (对齐手机端 CollectSheet:我喜欢的 + 本机歌单 + 服务器歌单)
import React, { useEffect, useReducer, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Icon } from '../theme/Icon';
import { C } from './hdtokens';
import { HDTouch } from './HDTouch';
import { useFav } from './useFav';
import { addToPlaylist } from '../state/favorites';
import { library } from '../state/library';
import { sync, subscribeSync } from '../services/sync';
import { useApp } from '../state/AppState';
import { toast } from '../components/Dialog';
import type { SongItem } from '../services/server';

export function HDCollect({ song, onClose }: { song: SongItem; onClose: () => void }) {
  const { connected, token } = useApp();
  const { faved, toggle } = useFav(song);
  const songKey = `${song.source}_${song.songmid}`;
  const [, syncTick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeSync(() => syncTick()), []); // lx117:删歌单后面板不再显示旧项
  const [pls, setPls] = useState<Array<{ key: string; localId?: string; name: string }>>(() =>
    library.all().map(p => ({ key: p.id, localId: p.id, name: p.name })));

  useEffect(() => {
    if (!connected || !token) return;
    let dead = false;
    const local = library.all().map(p => ({ key: p.id, localId: p.id, name: p.name }));
    setPls(local);
    sync.fetchLists().then(sp => {
      if (dead || !sp) return;
      setPls([...local, ...(sp.userList || []).map(u => ({ key: u.id, name: u.name }))]);
    }).catch(() => {});
    return () => { dead = true; };
  }, [connected, token, syncTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // lx114:收录标记(本地立即判;服务器行以打开面板时拉到的列表判断)
  const remoteNames = new Set<string>();
  const inPl = (cp: { key: string; localId?: string; name: string }) => {
    if (cp.localId) return !!library.get(cp.localId)?.songs.some(x => `${x.source}_${x.songmid}` === songKey);
    return false;
  };
  return (
    <View style={st.panel}>
      <Text style={st.title}>收藏到</Text>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <HDTouch style={st.row} onPress={toggle}>
          <Icon name="heart" size={15} active={faved} color={faved ? C.brand : '#ffffff99'} />
          <Text style={[st.rowText, faved && { color: C.brand }]} numberOfLines={1}>我喜欢的{faved ? ' · 已收藏' : ''}</Text>
        </HDTouch>
        {pls.map(cp => (
          <HDTouch key={cp.key} style={st.row} onPress={async () => {
            try {
              if (cp.localId) await addToPlaylist({ id: cp.localId }, song);
              else await addToPlaylist({ name: cp.name }, song,
                connected && token ? () => sync.fetchLists() : undefined,
                connected && token ? ((snap: Parameters<typeof sync.pushLists>[0]) => sync.pushLists(snap)) : undefined);
              toast(`已收藏到「${cp.name}」`);
            } catch { toast('收藏失败'); }
            onClose();
          }}>
            <Icon name="music" size={13} color="#ffffff77" />
            <Text style={st.rowText} numberOfLines={1}>{cp.name}</Text>
            {inPl(cp) ? <Icon name="check" size={13} active color={C.brand} /> : null}
          </HDTouch>
        ))}
      </ScrollView>
      <HDTouch style={st.close} onPress={onClose}>
        <Text style={st.closeText}>关闭</Text>
      </HDTouch>
    </View>
  );
}

const st = StyleSheet.create({
  panel: { position: 'absolute', right: 44, bottom: 90, width: 300, maxHeight: 400, borderRadius: 16, backgroundColor: 'rgba(10,14,12,.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)', padding: 12, gap: 8, zIndex: 60 },
  title: { color: '#ffffffcc', fontSize: 13, fontWeight: '700', paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 42, borderRadius: 10, backgroundColor: '#ffffff0d', paddingHorizontal: 12 },
  rowText: { color: '#ffffffd9', fontSize: 13, flex: 1 },
  close: { height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff12' },
  closeText: { color: '#ffffffaa', fontSize: 12, fontWeight: '600' },
});
