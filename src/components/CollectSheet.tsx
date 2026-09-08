import React, { useEffect, useReducer, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { useApp } from '../state/AppState';
import { library } from '../state/library';
import { isFav, setFav, addToPlaylist, songKey } from '../state/favorites';
import { playlistSync } from '../state/playlistSync'; // lx163:本地歌单操作镜像服务器
import { sync, lxNormKey } from '../services/sync';
import { toast } from './Dialog';
import type { SongItem } from '../services/server';

// 收藏到歌单：底部弹出。登录 → 服务器歌单；未登录 → 本机歌单。
// lx157:歌单行升级为双向——已收录的行显示已收藏态,点击移除(补齐移除收藏功能)
export function CollectSheet({ song, visible, onClose }: { song: SongItem | null; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { connected, token } = useApp();
  const [faved, setFaved] = useState(false);
  const [remotePls, setRemotePls] = useState<{ name: string; count: number; has: boolean }[]>([]);
  const [, libTick] = useReducer((x: number) => x + 1, 0); // lx157:本机歌单增删后刷新行状态
  useEffect(() => library.subscribe(() => libTick()), []);

  useEffect(() => {
    if (visible && song) setFaved(isFav(song));
  }, [visible, song?.songmid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (visible && connected && token) {
      sync.fetchLists().then(s => {
        if (!s) return;
        const k = song ? songKey(song) : '';
        setRemotePls(s.userList.map(u => ({
          name: u.name,
          count: u.list?.length || 0,
          has: !!song && (u.list || []).some(x => lxNormKey(x as never) === k),
        })));
      }).catch(() => {});
    }
  }, [visible, connected, token, song?.songmid]);

  if (!song) return null;
  const localPls = library.all();
  const k = songKey(song);

  const toggle = async () => {
    await setFav(song, !faved,
      connected && token ? (snap: any) => sync.pushLists(snap) : undefined,
      connected && token ? () => sync.fetchLists() : undefined);
    setFaved(!faved);
  };

  // lx157:服务器歌单行——已收录→移除;未收录→添加
  const toggleRemote = async (name: string, has: boolean) => {
    if (has) {
      const ok = await sync.removeSongFromUserListByName(name, song);
      if (!ok) { toast('服务器操作失败'); return; }
      toast(`已从「${name}」移除`);
      sync.fetchLists().then(s => {
        if (!s) return;
        setRemotePls(s.userList.map(u => ({
          name: u.name, count: u.list?.length || 0,
          has: (u.list || []).some(x => lxNormKey(x as never) === k),
        })));
      }).catch(() => {});
    } else {
      await addToPlaylist({ name }, song,
        connected && token ? () => sync.fetchLists() : undefined,
        connected && token ? (s: any) => sync.pushLists(s) : undefined);
      toast('已收藏');
      onClose();
    }
  };
  // lx163:本机歌单行——同上;加/减均镜像服务器
  const toggleLocal = async (id: string, name: string, has: boolean) => {
    if (has) {
      await playlistSync.removeSong(id, song);
      toast(`已从「${name}」移除`);
    } else {
      await playlistSync.addSongs(id, [song]);
      toast('已收藏');
      onClose();
    }
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
            {faved ? <Icon name="check" size={20} active color={C.brandText} /> : null}
          </TouchableOpacity>

          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {remotePls.map(pl => (
              <TouchableOpacity key={`r-${pl.name}`} style={s.row} onPress={() => toggleRemote(pl.name, pl.has)}>
                <View style={[s.rowIcon, pl.has && { backgroundColor: '#FF5A761A' }]}>
                  <Text style={[s.rowGlyph, pl.has && { color: '#FF5A76' }]}>♫</Text>
                </View>
                <Text style={s.rowTitle} numberOfLines={1}>{pl.name}</Text>
                <Text style={s.sub}>{pl.has ? `已收藏 · 点击移除` : `${pl.count} 首`}</Text>
                {pl.has ? <Icon name="check" size={18} active color="#FF5A76" /> : null}
              </TouchableOpacity>
            ))}
            {localPls.filter(p => p.name !== '我喜欢的').map(pl => {
              const has = (pl.songs || []).some(x => songKey(x) === k);
              return (
                <TouchableOpacity key={pl.id} style={s.row} onPress={() => toggleLocal(pl.id, pl.name, has)}>
                  <View style={[s.rowIcon, has && { backgroundColor: '#FF5A761A' }]}>
                    <Text style={[s.rowGlyph, has && { color: '#FF5A76' }]}>♫</Text>
                  </View>
                  <Text style={s.rowTitle} numberOfLines={1}>{pl.name}</Text>
                  <Text style={s.sub}>{has ? `已收藏 · 点击移除` : `${pl.songs.length} 首`}</Text>
                  {has ? <Icon name="check" size={18} active color="#FF5A76" /> : null}
                </TouchableOpacity>
              );
            })}
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
  scrim: { flex: 1, backgroundColor: C.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 8,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.handle, marginBottom: 10 },
  title: { color: C.text, fontSize: 18, lineHeight: 24, fontWeight: '700', marginBottom: 6 },
  loveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.strokeFaint, marginBottom: 4 },
  loveIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.inset2, alignItems: 'center', justifyContent: 'center' },
  loveTitle: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54 },
  rowIcon: { width: 40, height: 40, borderRadius: 8, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  rowGlyph: { color: C.text2, fontSize: 16 },
  rowTitle: { flex: 1, color: C.text, fontSize: 14, lineHeight: 19, fontWeight: '500' },
  sub: { color: C.text2, fontSize: 11, lineHeight: 15 },
  empty: { color: C.text2, fontSize: 12, lineHeight: 17, textAlign: 'center', paddingVertical: 20 },
});
