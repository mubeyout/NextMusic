// HD 首页:继续播放大卡 + 我的歌单横滚 + 榜单速览(点击跳榜单 tab 语义 → 榜单页)
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { Icon } from '../theme/Icon';
import { C, H } from './hdtokens';
import { usePlayer } from '../state/PlayerProvider';
import { useApp } from '../state/AppState';
import { library, type LocalPlaylist } from '../state/library';
import { getRecents } from '../state/recent';
import { sync, lxToApp, type UserListsSnapshot } from '../services/sync';
import { hdNav } from './hdnav';
import type { SongItem } from '../services/server';

const GRADS: [string, string][] = [
  ['#1f6b5c', '#142647'], ['#80381f', '#381a2e'], ['#5c297a', '#1f3861'],
  ['#146b85', '#1f2e47'], ['#1f6b5c', '#142647'], ['#80381f', '#381a2e'],
];

export function HDHome() {
  const insets = useSafeAreaInsets();
  const { current, playing, toggle } = usePlayer();
  const { connected, token } = useApp();
  const [localPls, setLocalPls] = useState<LocalPlaylist[]>([]);
  const [snap, setSnap] = useState<UserListsSnapshot | null>(null);
  const [recents, setRecents] = useState<SongItem[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = () => {
    setLocalPls(library.all());
    setRecents(getRecents().slice(0, 20));
    setSyncing(true);
    if (connected && token) {
      sync.fetchLists().then(s => setSnap(s)).catch(() => {}).finally(() => setSyncing(false));
    } else setSyncing(false);
  };
  useEffect(refresh, []); // eslint-disable-line react-hooks/exhaustive-deps

  const syncPls = snap?.userList || [];
  const playlists = [
    ...localPls.map(p => ({ key: p.id, localId: p.id, name: p.name, count: p.songs.length, img: p.cover || p.songs[0]?.img, songs: p.songs as SongItem[] })),
    ...syncPls.map(u => {
      const songs = (u.list || []).map(lxToApp);
      return { key: u.id, localId: undefined as string | undefined, name: u.name, count: songs.length, img: songs[0]?.img, songs };
    }),
  ];

  const openPl = (pl: typeof playlists[number]) => {
    hdNav()?.navigate('PlaylistDetail', pl.localId
      ? { localId: pl.localId, title: pl.name, songs: pl.songs }
      : { title: pl.name, songs: pl.songs, meta: `${pl.count} 首 · 同步歌单` });
  };

  return (
    <ScrollView
      style={st.screen}
      contentContainerStyle={{ paddingTop: Math.max(insets.top, 22), paddingBottom: 30, gap: 26 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={refresh} tintColor={C.brand} />}
    >
      {/* 继续播放 / 最近播放 */}
      {current ? (
        <TouchableOpacity activeOpacity={0.9} style={st.heroTouch} onPress={() => hdNav()?.navigate('Player')}>
          <LinearGradient colors={['#145938', '#1F2E52']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.hero}>
            {current.img
              ? <Image source={{ uri: current.img }} style={st.heroArt} />
              : <View style={[st.heroArt, { backgroundColor: '#00000055', alignItems: 'center', justifyContent: 'center' }]}><Icon name="music" size={40} color={C.text2} /></View>}
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <Text style={st.heroTag}>继续播放</Text>
              <Text style={st.heroTitle} numberOfLines={1}>{current.name}</Text>
              <Text style={st.heroSub} numberOfLines={1}>{current.singer}{current.albumName ? ` · ${current.albumName}` : ''}</Text>
            </View>
            <TouchableOpacity style={st.heroPlay} activeOpacity={0.85} onPress={toggle}>
              <Icon name={playing ? 'pause' : 'play'} size={34} color={C.onBrand} />
            </TouchableOpacity>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      {/* 我的歌单 */}
      <Section title={`我的歌单 · ${playlists.length}`}>
        {playlists.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 34, gap: 16 }}>
            {playlists.slice(0, 12).map((pl, i) => (
              <TouchableOpacity key={pl.key} activeOpacity={0.85} style={st.plCard} onPress={() => openPl(pl)}>
                {pl.img ? <Image source={{ uri: pl.img }} style={st.plArt} />
                  : <LinearGradient colors={GRADS[i % GRADS.length]} style={st.plArt}><Icon name="music" size={26} color="#FFFFFFAA" /></LinearGradient>}
                <Text style={st.plName} numberOfLines={1}>{pl.name}</Text>
                <Text style={st.plMeta}>{pl.count} 首</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <View style={{ paddingHorizontal: 34 }}>
            <Text style={st.empty}>还没有歌单 —— 连接服务器后自动同步,或在「我的」创建</Text>
          </View>
        )}
      </Section>

      {/* 最近播放 */}
      {recents.length ? (
        <Section title="最近播放">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 34, gap: 12 }}>
            {recents.map((s, i) => (
              <TouchableOpacity key={`${s.source}_${s.songmid}_${i}`} activeOpacity={0.85} style={st.recCard} onPress={() => hdNav()?.navigate('PlaylistDetail', { title: '最近播放', songs: recents, meta: `${recents.length} 首` })}>
                {s.img ? <Image source={{ uri: s.img }} style={st.recArt} /> : <View style={[st.recArt, { backgroundColor: '#232323' }]} />}
                <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: 2 }}>
                  <Text style={st.recName} numberOfLines={1}>{s.name}</Text>
                  <Text style={st.recSub} numberOfLines={1}>{s.singer}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Section>
      ) : null}

      {/* 快捷入口 */}
      <Section title="快捷入口">
        <View style={{ flexDirection: 'row', paddingHorizontal: 34, gap: 16 }}>
          {[
            { icon: 'server' as const, label: '媒体库', to: 'MediaLibs' },
            { icon: 'download' as const, label: '下载', to: 'Downloads' },
            { icon: 'headphones' as const, label: '本地音乐', to: 'DeviceMusic' },
            { icon: 'queue' as const, label: '播放队列', to: 'Queue' },
          ].map(q => (
            <TouchableOpacity key={q.label} activeOpacity={0.85} style={st.quick} onPress={() => hdNav()?.navigate(q.to)}>
              <Icon name={q.icon} size={26} color={C.brand} />
              <Text style={st.quickLabel}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 14 }}>
      <View style={{ paddingHorizontal: 34, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Text style={st.secTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  heroTouch: { paddingHorizontal: 34 },
  hero: { height: 150, borderRadius: 18, flexDirection: 'row', alignItems: 'center', padding: 20, gap: 20 },
  heroArt: { width: 110, height: 110, borderRadius: 12 },
  heroTag: { color: C.brand, fontSize: 13, fontWeight: '700' },
  heroTitle: { color: C.text, fontSize: 26, fontWeight: '800' },
  heroSub: { color: '#FFFFFF99', fontSize: 15 },
  heroPlay: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  secTitle: { color: C.text, fontSize: 20, fontWeight: '800' },
  empty: { color: C.text2, fontSize: 14 },
  plCard: { width: 150, gap: 8 },
  plArt: { width: 150, height: 150, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  plName: { color: C.text, fontSize: 15, fontWeight: '600' },
  plMeta: { color: C.text2, fontSize: 12 },
  recCard: { width: 240, height: 76, borderRadius: 12, backgroundColor: '#1E1E1E', flexDirection: 'row', alignItems: 'center', padding: 10, gap: 12 },
  recArt: { width: 56, height: 56, borderRadius: 8 },
  recName: { color: C.text, fontSize: 14, fontWeight: '600' },
  recSub: { color: C.text2, fontSize: 12 },
  quick: { flex: 1, height: 96, borderRadius: 14, backgroundColor: '#1E1E1E', alignItems: 'center', justifyContent: 'center', gap: 8 },
  quickLabel: { color: C.text, fontSize: 15, fontWeight: '600' },
});
