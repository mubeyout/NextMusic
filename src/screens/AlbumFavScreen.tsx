// lx163/v1.2.9:收藏专辑列表页(桌面侧栏入口)——镜像 ArtistFavScreen 桥接结构;
// 服务器 /api/user/library/albums 为真源,点击进专辑内页
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { PageHeader } from '../components/PageChrome';
import { HDTouch } from '../hd/HDTouch';
import { IS_HD } from '../services/appversion';
import { refreshAlbumFavs, toggleAlbumFav, isAlbumFav, useAlbumFavTick, type AlbumFav } from '../state/albumFavs';
import { toast } from '../components/Dialog';

const Row = IS_HD ? HDTouch : TouchableOpacity;

export function AlbumFavScreen() {
  const nav = useNavigation() as { navigate: (s: string, p?: object) => void; goBack: () => void };
  const [list, setList] = useState<AlbumFav[] | null>(null);
  useAlbumFavTick();

  useEffect(() => {
    refreshAlbumFavs().then(l => setList(l));
  }, []);

  return (
    <View style={st.screen}>
      <PageHeader title="收藏专辑" onBack={() => nav.goBack()} />
      {list == null ? (
        <View style={st.center}><ActivityIndicator color={C.brand} /></View>
      ) : !list.length ? (
        <View style={st.center}><Text style={st.empty}>{'暂无收藏专辑\n在专辑页收藏后多端同步'}</Text></View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={a => `${a.source || 'wy'}_${a.id}`}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => (
            <Row style={st.row} onPress={() => nav.navigate('AlbumDetail', { album: item })}>
              {item.img
                ? <Image source={{ uri: item.img }} style={st.art} />
                : <View style={[st.art, { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={20} color={C.text3} /></View>}
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text style={st.name} numberOfLines={1}>{item.name}</Text>
                <Text style={st.sub} numberOfLines={1}>{item.singer || item.source?.toUpperCase() || ''}</Text>
              </View>
              <Row
                style={st.favBtn}
                onPress={() => toggleAlbumFav(item).then(ok => {
                  if (!ok) { toast('同步失败,稍后重试'); return; }
                  setList(prev => (prev || []).filter(x => x !== item));
                })}
              >
                <Icon name="heart" size={18} color={isAlbumFav(item) ? C.brand : C.text3} />
              </Row>
            </Row>
          )}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: C.text3, textAlign: 'center', lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 10, backgroundColor: C.surface },
  art: { width: 52, height: 52, borderRadius: 8 },
  name: { color: C.text, fontSize: 15, fontWeight: '600' },
  sub: { color: C.text3, fontSize: 12 },
  favBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
