// lx103:HD 收藏到歌单面板(共享组件)——播放页收藏键/播放条收藏键统一行为:点按弹此面板选目标
// (对齐手机端 CollectSheet:我喜欢的 + 本机歌单 + 服务器歌单)
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, Pressable, Modal } from 'react-native';
import { Icon } from '../theme/Icon';
import { C } from './hdtokens';
import { HDTouch } from './HDTouch';
import { addToPlaylist, setFav, isFav } from '../state/favorites';
import { playlistSync } from '../state/playlistSync';
import { library } from '../state/library';
import { sync, subscribeSync } from '../services/sync';
import { useApp } from '../state/AppState';
import { toast } from '../components/Dialog';
import type { SongItem } from '../services/server';

export function HDCollect({ song, onClose }: { song: SongItem; onClose: () => void }) {
  const { connected, token } = useApp();
  // lx159:面板内「我喜欢的」行走纯 love 语义(isFav/setFav)——useFav.toggle 是 love-OR-歌单语义,
  // 歌仅收录在歌单时会显示已收藏但点击无效果;面板另有歌单行管收录,语义分家
  const loved = isFav(song);
  const toggleLove = async () => {
    await setFav(song, !loved,
      connected && token ? ((snap: Parameters<typeof sync.pushLists>[0]) => sync.pushLists(snap)) : undefined,
      connected && token ? () => sync.fetchLists() : undefined);
  };
  // lx149:BACK 关闭 + 焦点脱离 2.6s 自动关
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

  // lx147:收录标记(本地立即判)
  const inPl = (cp: { key: string; localId?: string; name: string }) => {
    if (cp.localId) return !!library.get(cp.localId)?.songs.some(x => `${x.source}_${x.songmid}` === songKey);
    return false;
  };

  return (
    <Modal transparent visible onRequestClose={onClose} animationType="none" statusBarTranslucent>
      <View style={st.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={st.panel}>
          <View style={st.head}>
            <Text style={st.title}>收藏到</Text>
            <HDTouch style={st.x} onPress={onClose}>
              <Icon name="close" size={13} color={C.text2} />
            </HDTouch>
          </View>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
            <HDTouch style={st.row} onPress={toggleLove} hasTVPreferredFocus>
              <Icon name="heart" size={15} active={loved} color={loved ? C.brand : C.text2} />
              <Text style={[st.rowText, loved && { color: C.brand }]} numberOfLines={1}>我喜欢的{loved ? ' · 已收藏' : ''}</Text>
            </HDTouch>
            {/* lx159:删「取消收藏（移出我喜欢的）」重复行——上行本身即 toggle,同义两入口属重复操作 */}
            {pls.map(cp => {
              const has = inPl(cp);
              return (
                <HDTouch key={cp.key} style={st.row} onPress={async () => {
                  try {
                    if (has) {
                      // lx159:已收录行点击=移除(对齐手机 CollectSheet 双向);lx163:镜像服务器
                      if (cp.localId) { await playlistSync.removeSong(cp.localId, song); toast(`已从「${cp.name}」移除`); }
                      else if (connected && token) {
                        const ok = await sync.removeSongFromUserListByName(cp.name, song);
                        toast(ok ? `已从「${cp.name}」移除` : '服务器操作失败');
                      }
                    } else {
                      if (cp.localId) await playlistSync.addSongs(cp.localId, [song]);
                      else await addToPlaylist({ name: cp.name }, song,
                        connected && token ? () => sync.fetchLists() : undefined,
                        connected && token ? ((snap: Parameters<typeof sync.pushLists>[0]) => sync.pushLists(snap)) : undefined);
                      toast(`已收藏到「${cp.name}」`);
                    }
                  } catch { toast('操作失败'); }
                  onClose();
                }}>
                  <Icon name="music" size={13} color={C.text3} />
                  <Text style={st.rowText} numberOfLines={1}>{cp.name}</Text>
                  {has ? <Icon name="check" size={13} active color={C.brand} /> : null}
                </HDTouch>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, elevation: 999 },
  panel: { position: 'absolute', left: (Dimensions.get('window').width - 380) / 2, top: 180, width: 380, maxHeight: 560, borderRadius: 18, backgroundColor: C.elev, borderWidth: 1, borderColor: C.border, padding: 14, gap: 8, elevation: 12 }, // lx148:与 HDActions 完全同位同宽 // lx147:与 HDActions 同位同主题
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  title: { color: C.text, fontSize: 14, fontWeight: '700', flex: 1 },
  x: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.inset },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, height: 44, borderRadius: 11, backgroundColor: C.inset, paddingHorizontal: 12 },
  rowText: { color: C.text, fontSize: 13, fontWeight: '500', flex: 1 },
});
