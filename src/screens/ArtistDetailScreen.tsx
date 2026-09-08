// lx163:歌手详情页(桥接屏,phone/HD 共用)——头像+收藏♥+热门歌曲+专辑列表
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { PageHeader } from '../components/PageChrome';
import { SongRow } from '../components/SongRow';
import { HDTouch } from '../hd/HDTouch';
import { IS_HD } from '../services/appversion';
import { api } from '../services/server';
import { toast } from '../components/Dialog';
import { usePlayer } from '../state/PlayerProvider';
import { isArtistFav, toggleArtistFav, useArtistFavTick, type ArtistFav } from '../state/artistFavs';
import type { SongItem } from '../services/server';

const Row = IS_HD ? HDTouch : TouchableOpacity;

export function ArtistDetailScreen() {
  const nav = useNavigation() as { navigate: (s: string, p?: object) => void; goBack: () => void };
  const p = useRoute().params as { artist: ArtistFav };
  const artist = p.artist;
  const { playSong } = usePlayer();
  const [songs, setSongs] = useState<SongItem[] | null>(null);
  const [albums, setAlbums] = useState<{ id: string; name: string; img?: string; publishTime?: string }[]>([]);
  useArtistFavTick();

  useEffect(() => {
    api.artistSongs(artist.id, artist.source || 'wy').then(setSongs);
    api.artistAlbums(artist.id, artist.source || 'wy').then(setAlbums);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const favd = isArtistFav(artist);
  return (
    <View style={st.screen}>
      <PageHeader title={artist.name} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {/* 头部 */}
        <View style={st.head}>
          {artist.img
            ? <Image source={{ uri: artist.img }} style={st.avatar} />
            : <View style={[st.avatar, st.avaFallback]}><Text style={st.avaGlyph}>{artist.name.slice(0, 1)}</Text></View>}
          <View style={{ flex: 1 }}>
            <Text style={st.name} numberOfLines={1}>{artist.name}</Text>
            <Text style={st.meta}>{(artist.source || 'wy').toUpperCase()} · {songs ? `${songs.length} 首热门` : '加载中…'}</Text>
          </View>
          <TouchableOpacity hitSlop={8} onPress={() => toggleArtistFav(artist).then(on => toast(on ? `已收藏 ${artist.name}` : `已取消收藏`)).catch(() => toast('服务器写入失败'))}>
            <Icon name="heart" size={26} active={favd} color={favd ? '#FF5A76' : C.text2} />
          </TouchableOpacity>
        </View>

        {/* 热门歌曲 */}
        <Text style={st.sec}>热门歌曲</Text>
        {songs == null ? <View style={{ paddingVertical: 30, alignItems: 'center' }}><ActivityIndicator color={C.brand} /></View>
          : songs.length ? songs.slice(0, 30).map((s, i) => (
            <SongRow key={`${s.source}-${s.songmid}-${i}`} song={s} onPress={() => playSong(s, songs.slice(0, 30))}
              playing={false} />
          )) : <Text style={st.empty}>暂无歌曲</Text>}

        {/* 专辑 */}
        {albums.length ? (
          <>
            <Text style={st.sec}>专辑 · {albums.length}</Text>
            <View style={st.albumGrid}>
              {albums.slice(0, 12).map(al => (
                <Row key={al.id} style={st.albumCard} activeOpacity={0.85}
                  focusStyle={IS_HD ? { borderWidth: 2, borderColor: C.brand, borderRadius: 12 } : undefined}
                  onPress={() => nav.navigate('AlbumDetail', { album: { id: al.id, name: al.name, singer: artist.name, img: al.img, source: artist.source } })}>
                  {al.img
                    ? <Image source={{ uri: al.img }} style={st.albumArt} />
                    : <View style={[st.albumArt, { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={26} color={C.text3} /></View>}
                  <Text style={st.albumName} numberOfLines={1}>{al.name}</Text>
                  {al.publishTime ? <Text style={st.albumYear} numberOfLines={1}>{String(al.publishTime).slice(0, 10)}</Text> : null}
                </Row>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avaFallback: { backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  avaGlyph: { color: C.text2, fontSize: 26, fontWeight: '800' },
  name: { color: C.text, fontSize: 19, fontWeight: '800' },
  meta: { color: C.text2, fontSize: 12, marginTop: 3 },
  sec: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  empty: { color: C.text2, fontSize: 12, textAlign: 'center', paddingVertical: 20 },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  albumCard: { width: 104, gap: 5 },
  albumArt: { width: 104, height: 104, borderRadius: 10 },
  albumName: { color: C.text, fontSize: 12, fontWeight: '600' },
  albumYear: { color: C.text2, fontSize: 10 },
});
