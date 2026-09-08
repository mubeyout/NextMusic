// lx163:专辑详情页(桥接屏)——封面+收藏专辑♥+曲目列表
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { PageHeader } from '../components/PageChrome';
import { HDTouch } from '../hd/HDTouch';
import { IS_HD } from '../services/appversion';

// lx163d:遥控适配——HD 用 HDTouch 焦点环,phone 保持 TouchableOpacity
const Row = IS_HD ? HDTouch : TouchableOpacity;
import { SongRow } from '../components/SongRow';
import { api, type SongItem } from '../services/server';
import { toast } from '../components/Dialog';
import { usePlayer } from '../state/PlayerProvider';
import { isAlbumFav, toggleAlbumFav, useAlbumFavTick, type AlbumFav } from '../state/albumFavs';

export function AlbumDetailScreen() {
  const nav = useNavigation() as { goBack: () => void };
  const p = useRoute().params as { album: AlbumFav };
  const album = p.album;
  const { playSong } = usePlayer();
  const [songs, setSongs] = useState<SongItem[] | null>(null);
  useAlbumFavTick();

  useEffect(() => { api.albumSongs(album.id, album.source || 'wy').then(setSongs); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const favd = isAlbumFav(album);
  return (
    <View style={st.screen}>
      <PageHeader title={album.name} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <View style={st.head}>
          {album.img
            ? <Image source={{ uri: album.img }} style={st.cover} />
            : <View style={[st.cover, { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={34} color={C.text3} /></View>}
          <View style={{ flex: 1 }}>
            <Text style={st.name} numberOfLines={2}>{album.name}</Text>
            <Text style={st.meta} numberOfLines={1}>{album.singer || ''} · {songs ? `${songs.length} 首` : '加载中…'}</Text>
            <Row style={st.favBtn} hitSlop={4} hasTVPreferredFocus={IS_HD}
              focusStyle={{ borderWidth: 2, borderColor: C.brand, borderRadius: 15 }}
              onPress={() => toggleAlbumFav(album).then(on => toast(on ? '已收藏专辑' : '已取消收藏')).catch(() => toast('服务器写入失败'))}>
              <Icon name="heart" size={16} active={favd} color={favd ? '#FF5A76' : C.text2} />
              <Text style={[st.favText, favd && { color: '#FF5A76' }]}>{favd ? '已收藏' : '收藏专辑'}</Text>
            </Row>
          </View>
        </View>

        {songs == null ? <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={C.brand} /></View>
          : songs.length ? songs.map((s, i) => (
            <SongRow key={`${s.source}-${s.songmid}-${i}`} song={s} onPress={() => playSong(s, songs)} playing={false} />
          )) : <Text style={st.empty}>暂无曲目</Text>}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: 'row', gap: 14, paddingVertical: 12, alignItems: 'center' },
  cover: { width: 110, height: 110, borderRadius: 12 },
  name: { color: C.text, fontSize: 17, fontWeight: '800', lineHeight: 23 },
  meta: { color: C.text2, fontSize: 12, marginTop: 4 },
  favBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.strokeFaint, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 6 },
  favText: { color: C.text2, fontSize: 12, fontWeight: '600' },
  empty: { color: C.text2, fontSize: 12, textAlign: 'center', paddingVertical: 30 },
});
