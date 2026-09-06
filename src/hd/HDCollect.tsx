// lx103:HD 收藏到歌单面板(共享组件)——播放页收藏键/播放条收藏键统一行为:点按弹此面板选目标
// (对齐手机端 CollectSheet:我喜欢的 + 本机歌单 + 服务器歌单)
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, BackHandler, Pressable } from 'react-native';
import { Icon } from '../theme/Icon';
import { C } from './hdtokens';
import { HDTouch } from './HDTouch';
import { useFav } from './useFav';
import { addToPlaylist, setFav } from '../state/favorites';
import { library } from '../state/library';
import { sync, subscribeSync } from '../services/sync';
import { useApp } from '../state/AppState';
import { toast } from '../components/Dialog';
import type { SongItem } from '../services/server';

export function HDCollect({ song, onClose }: { song: SongItem; onClose: () => void }) {
  const { connected, token } = useApp();
  const { faved, toggle } = useFav(song);
  // lx149:BACK 关闭 + 焦点脱离 2.6s 自动关
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const songKey = `${song.source}_${song.songmid}`;
  const [, syncTick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeSync(() => syncTick()), []); // lx117:删歌单后面板不再显示旧项
  const [pls, setPls] = useState<Array<{ key: string; localId?: string; name: string }>>(() =>
    library.all().map(p => ({ key: p.id, localId: p.id, name: p.name })));

  useEffect(() => {
    let dead = false;
    const local = library.all().filter(p => p.name !== '我喜欢的').map(p => ({ key: p.id, localId: p.id, name: p.name }));
    // lx126:缓存先行(秒开);联网后台补一次
    const cached = sync.cachedLists();
    if (cached) setPls([...local, ...(cached.userList || []).map(u => ({ key: u.id, name: u.name }))]);
    else setPls(local);
    if (connected && token) {
      sync.fetchLists().then(sp => {
        if (dead || !sp) return;
        setPls([...local, ...(sp.userList || []).map(u => ({ key: u.id, name: u.name }))]);
      }).catch(() => {});
    }
    return () => { dead = true; };
  }, [connected, token, syncTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // lx114:收录标记(本地立即判;服务器行以打开面板时拉到的列表判断)
  const remoteNames = new Set<string>();
  const inPl = (cp: { key: string; localId?: string; name: string }) => {
    if (cp.localId) return !!library.get(cp.localId)?.songs.some(x => `${x.source}_${x.songmid}` === songKey);
    return false;
  };
  return (
    <View style={st.overlay}>
      <Pressable style={StyleSheet.absoluteFill} focusable onPress={onClose} />
      <View style={st.panel}>
      <Text style={st.title}>收藏到</Text>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        <HDTouch style={st.row} onPress={toggle}>
          <Icon name="heart" size={15} active={faved} color={faved ? C.brand : '#ffffff99'} />
          <Text style={[st.rowText, faved && { color: C.brand }]} numberOfLines={1}>我喜欢的{faved ? ' · 已收藏' : ''}</Text>
        </HDTouch>
        <HDTouch style={st.row} onPress={async () => {
          if (!faved) { toast('当前歌曲未收藏'); return; }
          try {
            await setFav(song, false,
              connected && token ? ((snap: Parameters<typeof sync.pushLists>[0]) => sync.pushLists(snap)) : undefined,
              connected && token ? () => sync.fetchLists() : undefined);
            toast('已取消收藏');
          } catch { toast('操作失败'); }
          onClose();
        }}>
          <Icon name="close" size={14} color={faved ? '#FF6B6B' : C.text3} />
          <Text style={[st.rowText, { color: faved ? '#FF6B6B' : C.text3 }]} numberOfLines={1}>取消收藏{faved ? '（移出我喜欢的）' : ''}</Text>
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
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, elevation: 999 }, // lx150:全屏焦点捕捉器——光标脱离面板即落于此,立即关
  panel: { position: 'absolute', left: (Dimensions.get('window').width - 380) / 2, top: 180, width: 380, maxHeight: 560, borderRadius: 18, backgroundColor: C.elev, borderWidth: 1, borderColor: C.border, padding: 14, gap: 8, elevation: 24 }, // lx148:与 HDActions 完全同位同宽 // lx147:与 HDActions 同位同主题
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  title: { color: C.text, fontSize: 14, fontWeight: '700', flex: 1 },
  x: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.inset },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 44, borderRadius: 11, backgroundColor: C.inset, paddingHorizontal: 12 },
  rowText: { color: C.text, fontSize: 13, fontWeight: '500', flex: 1 },
});
