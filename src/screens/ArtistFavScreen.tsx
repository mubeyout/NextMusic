// lx161:收藏歌手列表页(L1 桥接屏,phone/HD 共用)
// 服务器 /api/user/library/artists 为真源;行内 ♥ 收藏/取消,点击进歌手歌曲页(带 artist 元数据可再收藏)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { PageHeader } from '../components/PageChrome';
import { HDTouch } from '../hd/HDTouch';
import { IS_HD } from '../services/appversion';
import { api } from '../services/server';
import { toast } from '../components/Dialog';
import { refreshArtistFavs, toggleArtistFav, isArtistFav, useArtistFavTick, type ArtistFav } from '../state/artistFavs';

const Row = IS_HD ? HDTouch : TouchableOpacity; // 桥接:HD 用 D-pad 焦点行

export function ArtistFavScreen() {
  const nav = useNavigation() as { navigate: (s: string, p?: object) => void; goBack: () => void };
  const [list, setList] = useState<ArtistFav[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // 正在拉歌曲的歌手 id
  useArtistFavTick(); // 收藏变更联动刷新

  useEffect(() => {
    refreshArtistFavs().then(l => setList(l));
  }, []);

  const openArtist = (a: ArtistFav) => {
    nav.navigate('ArtistDetail', { artist: a }); // lx163:歌手内页(热门+专辑+收藏)
  };

  return (
    <View style={st.screen}>
      <PageHeader title="收藏歌手" onBack={() => nav.goBack()} />
      {list == null ? (
        <View style={st.center}><ActivityIndicator color={C.brand} /></View>
      ) : !list.length ? (
        <View style={st.center}><Text style={st.empty}>{'暂无收藏歌手\n在歌手页或 Web 端收藏后同步'}</Text></View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={a => `${a.source || 'wy'}_${a.id}`}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 }}
          renderItem={({ item: a }) => {
            const favd = isArtistFav(a);
            return (
              <Row
                key={`${a.source || 'wy'}_${a.id}`}
                style={st.row}
                focusStyle={IS_HD ? { borderWidth: 2, borderColor: C.brand, borderRadius: 12 } : undefined}
                focusBg={IS_HD ? C.inset : undefined}
                activeOpacity={0.8}
                onPress={() => openArtist(a)}
              >
                {a.img
                  ? <Image source={{ uri: a.img }} style={st.roundArt} />
                  : <View style={[st.roundArt, st.artFallback]}><Text style={st.glyph}>{a.name.slice(0, 1)}</Text></View>}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.name} numberOfLines={1}>{a.name}</Text>
                  <Text style={st.meta} numberOfLines={1}>
                    {busy === a.id ? '加载中…' : `${a.count != null ? `${a.count} 首歌曲 · ` : ''}${(a.source || 'wy').toUpperCase()}`}
                  </Text>
                </View>
                <TouchableOpacity
                  hitSlop={8}
                  onPress={() => toggleArtistFav(a).then(on => toast(on ? `已收藏 ${a.name}` : `已取消收藏 ${a.name}`)).catch(() => toast('服务器写入失败'))}
                >
                  <Icon name="heart" size={20} active={favd} color={favd ? '#FF5A76' : C.text2} />
                </TouchableOpacity>
              </Row>
            );
          }}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: C.text2, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14, borderRadius: 12 },
  roundArt: { width: 46, height: 46, borderRadius: 23 },
  artFallback: { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  glyph: { color: C.text2, fontSize: 18, fontWeight: '700' },
  name: { color: C.text, fontSize: 14, fontWeight: '600' },
  meta: { color: C.text2, fontSize: 11, marginTop: 2 },
});
