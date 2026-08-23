import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { useApp } from '../state/AppState';
import { library } from '../state/library';
import { isFav, setFav, addToPlaylist, songKey } from '../state/favorites';
import { sync, appToLx } from '../services/sync';
import type { SongItem } from '../services/server';

// 收藏到歌单：底部弹出。登录 → 服务器歌单；未登录 → 本机歌单。
// 已收藏时首行显示「取消收藏」。
export function CollectSheet({ song, visible, onClose }: { song: SongItem | null; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { connected, token } = useApp();
  const [faved, setFaved] = useState(false);
  const [remotePls, setRemotePls] = useState<{ name: string; count: number }[]>([]);

  useEffect(() => {
    if (visible && song) setFaved(isFav(song));
  }, [visible, song?.songmid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (visible && connected && token) {
      sync.fetchLists().then(s => {
        if (s) setRemotePls(s.userList.map(u => ({ name: u.name, count: u.list?.length || 0 })));
      }).catch(() => {});
    }
  }, [visible, connected, token]);

  if (!song) return null;
  const localPls = library.all();

  const toggle = async () => {
    await setFav(song, !faved,
      connected && token ? (snap: any) => sync.pushLists(snap) : undefined,
      connected && token ? () => sync.fetchLists() : undefined);
    setFaved(!faved);
    if (!faved) { /* 刚收藏，保持 sheet 打开让用户看到状态 */ }
  };

  const addToRemote = async (name: string) => {
    await addToPlaylist({ name }, song,
      connected && token ? () => sync.fetchLists() : undefined,
      connected && token ? (s: any) => sync.pushLists(s) : undefined);
    onClose();
  };
  const addToLocal = async (id: string) => {
    await addToPlaylist({ id }, song);
    onClose();
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <TouchableOpacity style={s.scrim} activeOpacity={1} onPress={onClose}>
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]} onStartShouldSetResponder={() => true}>
          <View style={s.handle} />
          <Text style={s.title}>收藏到歌单</Text>

          <TouchableOpacity style={s.loveRow} onPress={toggle}>
            <View style={[s.loveIcon, faved && { backgroundColor: '#FF5A76' }]}>
              <Icon name="heart" size={20} active color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.loveTitle}>我喜欢的</Text>
              <Text style={s.sub}>{faved ? '已收藏 · 点击取消' : '快速收藏'}</Text>
            </View>
            {faved ? <Icon name="check" size={20} active color={C.brand} /> : null}
          </TouchableOpacity>

          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {remotePls.map(pl => (
              <TouchableOpacity key={`r-${pl.name}`} style={s.row} onPress={() => addToRemote(pl.name)}>
                <View style={s.rowIcon}><Text style={s.rowGlyph}>♫</Text></View>
                <Text style={s.rowTitle} numberOfLines={1}>{pl.name}</Text>
                <Text style={s.sub}>{pl.count} 首</Text>
              </TouchableOpacity>
            ))}
            {localPls.filter(p => p.name !== '我喜欢的').map(pl => (
              <TouchableOpacity key={pl.id} style={s.row} onPress={() => addToLocal(pl.id)}>
                <View style={s.rowIcon}><Text style={s.rowGlyph}>♫</Text></View>
                <Text style={s.rowTitle} numberOfLines={1}>{pl.name}</Text>
                <Text style={s.sub}>{pl.songs.length} 首</Text>
              </TouchableOpacity>
            ))}
            {!remotePls.length && localPls.length <= 1 ? (
              <Text style={s.empty}>{connected && token ? '暂无自建歌单' : '本地暂无歌单，可到「我的」导入创建'}</Text>
            ) : null}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A1A1A', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 8,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF2E', marginBottom: 10 },
  title: { color: C.text, fontSize: 18, lineHeight: 24, fontWeight: '700', marginBottom: 6 },
  loveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#FFFFFF12', marginBottom: 4 },
  loveIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2E2E2E', alignItems: 'center', justifyContent: 'center' },
  loveTitle: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54 },
  rowIcon: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  rowGlyph: { color: C.text2, fontSize: 16 },
  rowTitle: { flex: 1, color: C.text, fontSize: 14, lineHeight: 19, fontWeight: '500' },
  sub: { color: C.text2, fontSize: 11, lineHeight: 15 },
  empty: { color: C.text2, fontSize: 12, lineHeight: 17, textAlign: 'center', paddingVertical: 20 },
});
