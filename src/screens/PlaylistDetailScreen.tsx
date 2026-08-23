import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Icon } from '../theme/Icon';
import { C } from '../theme/tokens';
import { SongRow } from '../components/SongRow';
import { usePlayer } from '../state/PlayerProvider';
import { api, type SongItem, type SongListMeta } from '../services/server';
import { MiniPlayer } from '../components/MiniPlayer';
import { lxapi } from '../services/lxapi';

type Params = {
  // remote playlist
  remoteId?: string;
  remoteSource?: string;
  title?: string;
  cover?: string;
  meta?: string;
  desc?: string;
  playCount?: string;
  // direct song list (local / synced / leaderboard) — skip remote fetch
  songs?: SongItem[];
  // local playlist id
  localId?: string;
};

// Figma 26·歌单详情: header (cover + title + stats + desc + play all), action row, song list
export function PlaylistDetailScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation() as { goBack: () => void };
  const route = useRoute();
  const p = route.params as Params;
  const { playSong, current } = usePlayer();

  const [songs, setSongs] = useState<SongItem[] | null>(null);
  const [info, setInfo] = useState<SongListMeta | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      if (p.songs && p.songs.length) {
        setSongs(p.songs);
        setTotal(p.songs.length);
        return;
      }
      if (p.remoteId) {
        const r = await lxapi.songListDetail(p.remoteId, 1);
        if (dead) return;
        setSongs(r.list || []);
        setInfo(r.info || null);
        setTotal(r.info?.total || r.list?.length || 0);
      } else {
        setSongs([]);
      }
    })();
    return () => { dead = true; };
  }, [p.remoteId, p.songs]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    if (!p.remoteId || busy || !songs || songs.length >= total) return;
    setBusy(true);
    const r = await lxapi.songListDetail(p.remoteId, page + 1);
    const more = r.list || [];
    if (more.length) { setSongs(prev => [...(prev || []), ...more]); setPage(pg => pg + 1); }
    setBusy(false);
  };

  const title = p.title || info?.name || '歌单';
  const cover = p.cover || info?.img;
  const stat = total ? `${total} 首${p.remoteId ? ' · 在线歌单' : ''}` : (p.meta || '歌单');

  return (
    <View style={st.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: current ? 116 : 32 }}
        onScroll={({ nativeEvent }) => {
          if (nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height > nativeEvent.contentSize.height - 300) loadMore();
        }}
        scrollEventThrottle={200}
      >
        <View style={st.header}>
          <TouchableOpacity style={st.hBtn} onPress={() => nav.goBack()} hitSlop={4}>
            <Icon name="back" size={24} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={st.hBtn} hitSlop={4}><Icon name="more" size={24} /></TouchableOpacity>
        </View>

        <View style={st.headCard}>
          {cover ? (
            <Image source={{ uri: cover }} style={st.cover} />
          ) : (
            <View style={[st.cover, st.coverFallback]}><Text style={st.coverGlyph}>♫</Text></View>
          )}
          <View style={st.headMeta}>
            <Text style={st.title} numberOfLines={2}>{title}</Text>
            <Text style={st.stat}>{stat}</Text>
            {info?.play_count ? <Text style={st.stat}>播放 {info.play_count} 次</Text> : null}
          </View>
        </View>
        {info?.desc ? <Text style={st.desc} numberOfLines={2}>{info.desc}</Text> : null}

        <TouchableOpacity
          style={st.playAllBtn}
          onPress={() => { if (songs && songs.length) playSong(songs[0], songs); }}
          disabled={!songs || !songs.length}
        >
          <Icon name="play" size={20} active color={C.onBrand} />
          <Text style={st.playAllText}>播放全部</Text>
          <Text style={st.playAllCount}>{total ? `(${total})` : ''}</Text>
        </TouchableOpacity>

        <View style={st.actionRow}>
          <TouchableOpacity style={st.action}><Icon name="search" size={20} color={C.text2} /><Text style={st.actionText}>搜索歌单</Text></TouchableOpacity>
          <TouchableOpacity style={st.action}><Icon name="download" size={20} color={C.text2} /><Text style={st.actionText}>排序</Text></TouchableOpacity>
          <TouchableOpacity style={st.action}><Icon name="more" size={20} color={C.text2} /><Text style={st.actionText}>批量操作</Text></TouchableOpacity>
        </View>

        {songs == null ? (
          <View style={st.center}><ActivityIndicator color={C.brand} /></View>
        ) : songs.length === 0 ? (
          <Text style={st.empty}>歌单为空</Text>
        ) : (
          <View style={st.songList}>
            {songs.map((s, i) => (
              <SongRow
                key={`${s.source}-${s.songmid}-${i}`}
                song={s}
                playing={current?.songmid === s.songmid}
                onPress={() => playSong(s, songs)}
              />
            ))}
          </View>
        )}
        {busy ? <View style={st.center}><ActivityIndicator color={C.brand} /></View> : null}
      </ScrollView>
      {/* Figma 歌单页有底部播放栏：MiniPlayer 绝对定位悬浮（无播放时自隐藏） */}
      <View style={st.miniDock} pointerEvents="box-none">
        <MiniPlayer />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20 },
  miniDock: { position: 'absolute', left: 0, right: 0, bottom: 12 },
  header: { height: 44, flexDirection: 'row', alignItems: 'center' },
  hBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headCard: { flexDirection: 'row', gap: 14, marginTop: 4 },
  cover: { width: 120, height: 120, borderRadius: 10 },
  coverFallback: { backgroundColor: '#233029', alignItems: 'center', justifyContent: 'center' },
  coverGlyph: { color: C.text, fontSize: 40, fontWeight: '700' },
  headMeta: { flex: 1, paddingTop: 4, gap: 6 },
  title: { color: C.text, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  stat: { color: C.text2, fontSize: 11, lineHeight: 16 },
  desc: { color: C.text2, fontSize: 11, lineHeight: 16, marginTop: 12 },
  playAllBtn: {
    height: 46, borderRadius: 14, backgroundColor: C.brand, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18,
  },
  playAllText: { color: C.onBrand, fontSize: 14, lineHeight: 17, fontWeight: '600' },
  playAllCount: { color: '#0E3B1F', fontSize: 12 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 6 },
  action: {
    flex: 1, height: 40, borderRadius: 12, backgroundColor: '#1A1A1A',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  actionText: { color: C.text2, fontSize: 11, lineHeight: 13, fontWeight: '500' },
  center: { paddingVertical: 40, alignItems: 'center' },
  empty: { color: C.text2, fontSize: 12, textAlign: 'center', paddingVertical: 40 },
  songList: { gap: 8, marginTop: 4 },
});
